var UserPatronProfileModel = require("../../models/userPatronProfile");
var UserPatronProfileChangeModel = require("../../models/logs/userPatronProfileChange");
var CoursePatronProfileModel = require("../../models/coursePatronProfile");
var mongoose = require("mongoose");
const logger = require("../../middleware/logger");

const UpdateUserPatronProfileStatus = Object.freeze({
  Created: 200,
  Updated: 209,
  SameActivePatron: 210,
  MissingArguments: 400,
  InternalError: 500,
});

const GetUserPatronProfileStatus = Object.freeze({
  Retrieved: 200,
  NoProfile: 452,
  MissingArguments: 400,
  InternalError: 500,
});

const GetUserPatronProfilesStatus = Object.freeze({
  Retrieved: 200,
  NoProfiles: 452,
  MissingArguments: 400,
  InternalError: 500,
});

const GetCoursePatronProfilesStatus = Object.freeze({
  Retrieved: 200,
  NoProfiles: 452,
  MissingArguments: 400,
  InternalError: 500,
});

function readPatronStanding(profile, patronKey) {
  if (!profile || !patronKey) return 0;
  // mongoose Map
  if (
    profile.patronStandings &&
    typeof profile.patronStandings.get === "function"
  ) {
    const val = profile.patronStandings.get(patronKey);
    return Number.isFinite(val) ? val : 0;
  }
  // plain js object
  const val = profile.patronStandings
    ? profile.patronStandings[patronKey]
    : undefined;
  return Number.isFinite(val) ? val : 0;
}

var functions = {
  /**
   * Update the user's patron profile for a given course.
   * @param {String} course The course's ID.
   * @param {String} patron [JSON body] The new patron that should be set as active for the user.
   * @param {double} standingUpdate [JSON body] The modifier to update the user's active patron's standing. Can be negative.
   *
   * The **course** parameter is required, while the user is identified via the authentication token itself.
   * To perform an update, either the **patron** or **standingUpdate** should be provided via the JSON body of the request.
   *
   * If the user does not yet have a profile, it will be created. In that case, if the user has provided a patron with their request, the given patron will be set as their active patron, otherwise the default 'apollo' patron is used.
   * Similarly, if the user provided a standingUpdate, it will be used as the starting value of their active patron.
   *
   * If the user already has a profile, their active patron will be updated to the given **patron**. Otherwise, if the user has provided a **standingUpdate**, their active patron's standing will be updated.
   *
   * **Course:** whenever the user's standing for a patron is updated, the respective patron's course-level standing is also updated via CoursePatronProfileModel.
   *
   * **Logging:** whenever the user's active patron is changed, it is logged via a new UserPatronProfileChangeModel object.
   */
  updateUserPatronProfile: async function (req, res) {
    // 0 is a valid value for standing updates
    const rawStanding =
      req.body && req.body.standingUpdate ? req.body.standingUpdate : undefined;
    const standingNum = rawStanding !== undefined ? Number(rawStanding) : NaN;
    const hasStandingParam =
      rawStanding !== undefined && !Number.isNaN(standingNum);
    // If provided, clamp to [-1, 1].
    const patronStandingUpdate = hasStandingParam
      ? Math.max(-1, Math.min(1, standingNum))
      : null;

    if (
      !req.params.course ||
      !mongoose.isValidObjectId(req.params.course) ||
      (!req.body.patron && !hasStandingParam)
    ) {
      return res.status(UpdateUserPatronProfileStatus.MissingArguments).send({
        message: "User Patron Profile update failed: parameter missing.",
      });
    }
    const courseId = new mongoose.Types.ObjectId(String(req.params.course));
    const userId = new mongoose.Types.ObjectId(String(req.token._id));

    try {
      const userPatronProfile = await UserPatronProfileModel.findOne({
        course: courseId,
        user: userId,
      }).exec();
      // User doesn't have a profile for this course yet, so create a new one.
      if (!userPatronProfile) {
        const patronStandings = {};
        patronStandings[req.body.patron ?? "apollo"] =
          patronStandingUpdate ?? 0.0;
        const newUserPatronProfile = new UserPatronProfileModel({
          course: courseId,
          user: userId,
          // Use 'apollo' as the default patron.
          activePatron: req.body.patron ?? "apollo",
          patronStandings: patronStandings,
          activePatronLastChanged: req.body.patron ? new Date() : null,
        });

        const savedNewUserPatronProfile = await newUserPatronProfile.save();
        if (!savedNewUserPatronProfile) {
          return res.status(UpdateUserPatronProfileStatus.InternalError).send({
            message: "User's Patron Profile creation failed. [ERR100]",
          });
        }
        // Do not return, as we will still do some additional processing after we've sent the response.
        res.status(UpdateUserPatronProfileStatus.Created).send({
          message: "User's Patron Profile has been created.",
          userPatronProfile: savedNewUserPatronProfile.toJSON(),
        });
        // Log active patron change
        if (req.body.patron) {
          const userPatronProfileChange = new UserPatronProfileChangeModel({
            course: courseId,
            user: userId,
            newPatron: req.body.patron,
          });

          userPatronProfileChange.save().catch((err) => {
            logger.error(
              `[ERR200] UserPatronProfileChange creation failed: ${err}`,
            );
          });
        }
        // Update the course patron profile
        if (hasStandingParam) {
          CoursePatronProfileModel.updateOne(
            {
              course: courseId,
              patron: req.body.patron ?? "apollo",
            },
            {
              $inc: {
                score: patronStandingUpdate,
                contributionCount: 1,
              },
            },
            { upsert: true },
          )
            .exec()
            .catch((err) => {
              logger.error(
                `[ERR201] CoursePatronProfile update failed: ${err}`,
              );
            });
        }

        return;
      }

      // Update existing
      else {
        // Case 1: update active patron
        if (req.body.patron) {
          if (userPatronProfile.activePatron == req.body.patron) {
            return res
              .status(UpdateUserPatronProfileStatus.SameActivePatron)
              .send({
                message:
                  "User's Patron Profile update for active patron ignored: active patron is already the same.",
                userPatronProfile: userPatronProfile.toJSON(),
              });
          } else {
            const updatedUserPatronProfile =
              await UserPatronProfileModel.findOneAndUpdate(
                { course: courseId, user: userId },
                {
                  activePatron: req.body.patron,
                  activePatronLastChanged: new Date(),
                },
                { new: true },
              ).exec();
            if (!updatedUserPatronProfile) {
              return res
                .status(UpdateUserPatronProfileStatus.InternalError)
                .send({
                  message: "User's Patron Profile update failed. [ERR102]",
                });
            }
            // Do not return, as we will still do some additional processing after we've sent the response.
            res.status(UpdateUserPatronProfileStatus.Updated).send({
              message: "User's Patron Profile updated.",
              userPatronProfile: updatedUserPatronProfile.toJSON(),
            });
            // Log active patron change
            const userPatronProfileChange = new UserPatronProfileChangeModel({
              course: courseId,
              user: userId,
              oldPatron: userPatronProfile.activePatron,
              newPatron: updatedUserPatronProfile.activePatron,
            });
            userPatronProfileChange.save().catch((err) => {
              logger.error(
                `[ERR200] UserPatronProfileChange creation failed: ${err}`,
              );
            });

            return;
          }
        } else if (hasStandingParam) {
          const patronCurrentStanding = readPatronStanding(
            userPatronProfile,
            userPatronProfile.activePatron,
          );

          const updatedUserPatronProfile =
            await UserPatronProfileModel.findOneAndUpdate(
              { course: courseId, user: userId },
              {
                $set: {
                  [`patronStandings.${userPatronProfile.activePatron}`]:
                    Math.max(
                      -1,
                      Math.min(1, patronCurrentStanding + patronStandingUpdate),
                    ),
                },
              },
              { new: true },
            ).exec();
          if (!updatedUserPatronProfile) {
            return res
              .status(UpdateUserPatronProfileStatus.InternalError)
              .send({
                message: "User's Patron Profile update failed. [ERR104]",
              });
          }
          // Do not return, as we will still do some additional processing after we've sent the response.
          res.status(UpdateUserPatronProfileStatus.Updated).send({
            message: "User's Patron Profile updated.",
            userPatronProfile: updatedUserPatronProfile.toJSON(),
          });
          // Update the course patron profile
          CoursePatronProfileModel.updateOne(
            {
              course: courseId,
              patron: userPatronProfile.activePatron,
            },
            {
              $inc: {
                score: patronStandingUpdate,
                contributionCount: 1,
              },
            },
            { upsert: true },
          )
            .exec()
            .catch((err) => {
              logger.error(
                `[ERR200] CoursePatronProfile update failed: ${err}`,
              );
            });

          return;
        } else {
          return res
            .status(UpdateUserPatronProfileStatus.MissingArguments)
            .send({
              message:
                "User Patron Profile update failed: indicate a new active patron or a patron standing update value.",
            });
        }
      }
    } catch (err) {
      logger.error(err);
      return res.status(UpdateUserPatronProfileStatus.InternalError).send({
        message: "User's Patron Profile update failed. [ERR99]",
      });
    }
  },
  getUserPatronProfile: async function (req, res) {
    if (!req.params.course) {
      return res.status(GetUserPatronProfileStatus.MissingArguments).send({
        message: "User Patron Profile retrieval failed: parameter missing.",
      });
    }
    if (!mongoose.isValidObjectId(req.params.course)) {
      return res.status(GetUserPatronProfileStatus.MissingArguments).send({
        message: "User Patron Profile retrieval failed: parameter missing.",
      });
    }
    const courseId = new mongoose.Types.ObjectId(String(req.params.course));
    const userId = new mongoose.Types.ObjectId(String(req.token._id));
    try {
      const userPatronProfile = await UserPatronProfileModel.findOne({
        course: courseId,
        user: userId,
      }).exec();
      if (!userPatronProfile) {
        return res.status(GetUserPatronProfileStatus.NoProfile).send({
          message: "User Patron Profile retrieval failed: no profile found.",
        });
      }
      return res.status(GetUserPatronProfileStatus.Retrieved).send({
        message: "User Patron Profile retrieved.",
        userPatronProfile: userPatronProfile.toJSON(),
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetUserPatronProfileStatus.InternalError).send({
        message:
          "User Patron Profile retrieval failed: an error occurred. [ERR100]",
      });
    }
  },
  /**
   * If the '**course**' parameter is provided, all UserPatronProfiles for the given course are retrieved.
   *
   * Otherwise, the authenticated user's (based on passed token) UserPatronProfiles for all their courses are retrieved.
   */
  getUserPatronProfiles: async function (req, res) {
    const userId = new mongoose.Types.ObjectId(String(req.token._id));
    let courseId = null;
    if (req.params.course) {
      if (mongoose.isValidObjectId(req.params.course)) {
        courseId = new mongoose.Types.ObjectId(String(req.params.course));
      } else {
        return res.status(GetUserPatronProfilesStatus.MissingArguments).send({
          message:
            "User Patron Profiles retrieval failed: an error occurred. [ERR105]",
        });
      }
    }
    const searchCriteria = courseId ? { course: courseId } : { user: userId };
    try {
      const userPatronProfiles = await UserPatronProfileModel.find(
        searchCriteria,
      )
        .populate("userDetails", "username role")
        .lean()
        .exec();
      if (!userPatronProfiles || userPatronProfiles.length === 0) {
        return res.status(GetUserPatronProfilesStatus.NoProfiles).send({
          message: "No User Patron profiles to retrieve.",
          userPatronProfiles: [],
        });
      }
      return res.status(GetUserPatronProfilesStatus.Retrieved).send({
        message: "User Patron profiles retrieved.",
        userPatronProfiles: userPatronProfiles,
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetUserPatronProfilesStatus.InternalError).send({
        message:
          "User Patron Profiles retrieval failed: an error occurred. [ERR102]",
      });
    }
  },
  getCoursePatronProfiles: async function (req, res) {
    if (!req.params.course || !mongoose.isValidObjectId(req.params.course)) {
      return res.status(GetCoursePatronProfilesStatus.MissingArguments).send({
        message: "Course Patron Profiles retrieval failed: parameter missing.",
      });
    }
    const courseId = new mongoose.Types.ObjectId(String(req.params.course));
    try {
      const coursePatronProfiles = await CoursePatronProfileModel.find({
        course: courseId,
      })
        .lean()
        .exec();
      if (!coursePatronProfiles || coursePatronProfiles.length === 0) {
        return res.status(GetCoursePatronProfilesStatus.NoProfiles).send({
          message:
            "Course Patron Profiles retrieval failed: no profiles found.",
        });
      }
      return res.status(GetCoursePatronProfilesStatus.Retrieved).send({
        message: "Course Patron profiles retrieved.",
        coursePatronProfiles: coursePatronProfiles,
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetCoursePatronProfilesStatus.InternalError).send({
        message:
          "Course Patron Profiles retrieval failed: an error occurred. [ERR100]",
      });
    }
  },
};

module.exports = functions;
