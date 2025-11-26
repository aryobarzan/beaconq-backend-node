import {
  UserPatronProfileDocument,
  UserPatronProfileModel,
} from '../../models/userPatronProfile';
import { UserPatronProfileChangeModel } from '../../models/logs/userPatronProfileChange';
import { CoursePatronProfileModel } from '../../models/coursePatronProfile';
import mongoose from 'mongoose';
import logger from '../../middleware/logger';
import { Response } from 'express';

enum UpdateUserPatronProfileStatus {
  Created = 200,
  Updated = 209,
  SameActivePatron = 210,
  MissingArguments = 400,
  InternalError = 500,
}

enum GetUserPatronProfileStatus {
  Retrieved = 200,
  NoProfile = 452,
  MissingArguments = 400,
  InternalError = 500,
}

enum GetUserPatronProfilesStatus {
  Retrieved = 200,
  NoProfiles = 452,
  MissingArguments = 400,
  InternalError = 500,
}

enum GetCoursePatronProfilesStatus {
  Retrieved = 200,
  NoProfiles = 452,
  MissingArguments = 400,
  InternalError = 500,
}

const AVAILABLE_PATRONS = [
  'apollo',
  'artemis',
  'atlas',
  'dionysus',
  'hades',
  'hermes',
  'prometheus',
  'themis',
];
const DEFAULT_PATRON = 'apollo';
const MIN_STANDING = -1;
const MAX_STANDING = 1;

function clampStanding(value: number): number {
  return Math.max(MIN_STANDING, Math.min(MAX_STANDING, value));
}

function isValidPatron(patron: string): boolean {
  return AVAILABLE_PATRONS.includes(patron);
}

function readPatronStanding(
  profile: UserPatronProfileDocument,
  patronKey: string
) {
  if (!profile || !patronKey) return 0;
  const val = profile.patronStandings.get(patronKey);
  return Number.isFinite(val) ? val : 0;
}
const functions = {
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
  updateUserPatronProfile: async function (
    req: Express.AuthenticatedRequest<
      { course: string },
      {},
      { standingUpdate?: number; patron?: string }
    >,
    res: Response
  ) {
    // 0 is a valid value for standing updates
    const rawStanding =
      req.body && req.body.standingUpdate ? req.body.standingUpdate : undefined;
    const standingNum = rawStanding !== undefined ? Number(rawStanding) : NaN;
    const hasStandingParam =
      rawStanding !== undefined && !Number.isNaN(standingNum);
    // If provided, clamp to [-1, 1].
    const patronStandingUpdate = hasStandingParam
      ? clampStanding(standingNum)
      : null;

    if (
      !req.params.course ||
      !mongoose.isValidObjectId(req.params.course) ||
      (!req.body.patron && !hasStandingParam) ||
      (req.body.patron && !isValidPatron(req.body.patron))
    ) {
      return res.status(UpdateUserPatronProfileStatus.MissingArguments).send({
        message: 'User Patron Profile update failed: parameter missing.',
      });
    }
    const courseId = new mongoose.Types.ObjectId(req.params.course);
    const userId = new mongoose.Types.ObjectId(req.token._id);

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      return res.status(UpdateUserPatronProfileStatus.InternalError).send({
        message: `User Patron Profile update failed: internal error (session). (${err})`,
      });
    }
    let responseData: any;
    let responseStatus: number | undefined;
    try {
      await session.withTransaction(async () => {
        const userPatronProfile = await UserPatronProfileModel.findOne({
          course: courseId,
          user: userId,
        })
          .session(session)
          .exec();
        // User doesn't have a profile for this course yet, so create a new one.
        if (!userPatronProfile) {
          const patronStandings = {};
          patronStandings[req.body.patron ?? DEFAULT_PATRON] =
            patronStandingUpdate ?? 0.0;
          const newUserPatronProfile = new UserPatronProfileModel({
            course: courseId,
            user: userId,
            // Use 'apollo' as the default patron.
            activePatron: req.body.patron ?? DEFAULT_PATRON,
            patronStandings: patronStandings,
            activePatronLastChanged: req.body.patron ? new Date() : null,
          });

          const savedNewUserPatronProfile = await newUserPatronProfile.save({
            session,
          });
          if (!savedNewUserPatronProfile) {
            responseData = {
              message: "User's Patron Profile creation failed. [ERR100]",
            };
            responseStatus = UpdateUserPatronProfileStatus.InternalError;
            return;
          }
          // Log active patron change
          if (req.body.patron) {
            const userPatronProfileChange = new UserPatronProfileChangeModel({
              course: courseId,
              user: userId,
              newPatron: req.body.patron,
            });

            await userPatronProfileChange.save({ session });
          }
          // Update the course patron profile
          if (hasStandingParam) {
            await CoursePatronProfileModel.updateOne(
              {
                course: courseId,
                patron: req.body.patron ?? DEFAULT_PATRON,
              },
              {
                $inc: {
                  score: patronStandingUpdate,
                  contributionCount: 1,
                },
              },
              { upsert: true }
            )
              .session(session)
              .exec();
          }
          responseData = {
            message: "User's Patron Profile has been created.",
            userPatronProfile: savedNewUserPatronProfile.toJSON(),
          };
          responseStatus = UpdateUserPatronProfileStatus.Created;
          return;
        }
        // Update existing
        else {
          // Case 1: update active patron
          if (req.body.patron) {
            if (userPatronProfile.activePatron == req.body.patron) {
              responseData = {
                message:
                  "User's Patron Profile update for active patron ignored: active patron is already the same.",
                userPatronProfile: userPatronProfile.toJSON(),
              };
              responseStatus = UpdateUserPatronProfileStatus.SameActivePatron;
              return;
            } else {
              const updatedUserPatronProfile =
                await UserPatronProfileModel.findOneAndUpdate(
                  { course: courseId, user: userId },
                  {
                    activePatron: req.body.patron,
                    activePatronLastChanged: new Date(),
                  },
                  { new: true }
                )
                  .session(session)
                  .exec();
              if (!updatedUserPatronProfile) {
                responseData = {
                  message: "User's Patron Profile update failed. [ERR102]",
                  userPatronProfile: userPatronProfile.toJSON(),
                };
                responseStatus = UpdateUserPatronProfileStatus.InternalError;
                return;
              }
              // Log active patron change
              const userPatronProfileChange = new UserPatronProfileChangeModel({
                course: courseId,
                user: userId,
                oldPatron: userPatronProfile.activePatron,
                newPatron: updatedUserPatronProfile.activePatron,
              });
              await userPatronProfileChange.save({ session });
              responseData = {
                message: "User's Patron Profile updated.",
                userPatronProfile: updatedUserPatronProfile.toJSON(),
              };
              responseStatus = UpdateUserPatronProfileStatus.Updated;
              return;
            }
          } else if (hasStandingParam) {
            const patronCurrentStanding = readPatronStanding(
              userPatronProfile,
              userPatronProfile.activePatron
            );
            if (!patronCurrentStanding || !patronStandingUpdate) {
              responseData = {
                message: "User's Patron Profile update failed. [ERR103]",
                userPatronProfile: userPatronProfile.toJSON(),
              };
              responseStatus = UpdateUserPatronProfileStatus.InternalError;
              return;
            }

            const updatedUserPatronProfile =
              await UserPatronProfileModel.findOneAndUpdate(
                { course: courseId, user: userId },
                {
                  $set: {
                    [`patronStandings.${userPatronProfile.activePatron}`]:
                      clampStanding(
                        patronCurrentStanding + patronStandingUpdate
                      ),
                  },
                },
                { new: true }
              )
                .session(session)
                .exec();
            if (!updatedUserPatronProfile) {
              responseData = {
                message: "User's Patron Profile update failed. [ERR104]",
                userPatronProfile: userPatronProfile.toJSON(),
              };
              responseStatus = UpdateUserPatronProfileStatus.InternalError;
              return;
            }
            // Update the course patron profile
            await CoursePatronProfileModel.updateOne(
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
              { upsert: true }
            )
              .session(session)
              .exec();
            responseData = {
              message: "User's Patron Profile updated.",
              userPatronProfile: updatedUserPatronProfile.toJSON(),
            };
            responseStatus = UpdateUserPatronProfileStatus.Updated;
            return;
          } else {
            responseData = {
              message:
                'User Patron Profile update failed: indicate a new active patron or a patron standing update value.',
              userPatronProfile: userPatronProfile.toJSON(),
            };
            responseStatus = UpdateUserPatronProfileStatus.MissingArguments;
            return;
          }
        }
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(UpdateUserPatronProfileStatus.InternalError).send({
        message: "User's Patron Profile update failed. [ERR99]",
      });
    } finally {
      if (responseData && responseStatus) {
        res.status(responseStatus).send(responseData);
      } else {
        res.status(UpdateUserPatronProfileStatus.InternalError).send({
          message: "User's Patron Profile update failed. [ERR99]",
        });
      }

      session.endSession();
    }
  },
  getUserPatronProfile: async function (
    req: Express.AuthenticatedRequest<{ course: string }>,
    res: Response
  ) {
    if (!req.params.course) {
      return res.status(GetUserPatronProfileStatus.MissingArguments).send({
        message: 'User Patron Profile retrieval failed: parameter missing.',
      });
    }
    if (!mongoose.isValidObjectId(req.params.course)) {
      return res.status(GetUserPatronProfileStatus.MissingArguments).send({
        message: 'User Patron Profile retrieval failed: parameter missing.',
      });
    }
    const courseId = new mongoose.Types.ObjectId(req.params.course);
    const userId = new mongoose.Types.ObjectId(req.token._id);
    try {
      const userPatronProfile = await UserPatronProfileModel.findOne({
        course: courseId,
        user: userId,
      })
        .lean()
        .exec();
      if (!userPatronProfile) {
        return res.status(GetUserPatronProfileStatus.NoProfile).send({
          message: 'User Patron Profile retrieval failed: no profile found.',
        });
      }
      return res.status(GetUserPatronProfileStatus.Retrieved).send({
        message: 'User Patron Profile retrieved.',
        userPatronProfile: userPatronProfile,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetUserPatronProfileStatus.InternalError).send({
        message:
          'User Patron Profile retrieval failed: an error occurred. [ERR100]',
      });
    }
  },
  /**
   * If the '**course**' parameter is provided, all UserPatronProfiles for the given course are retrieved.
   *
   * Otherwise, the authenticated user's (based on passed token) UserPatronProfiles for all their courses are retrieved.
   */
  getUserPatronProfiles: async function (
    req: Express.AuthenticatedRequest<{ course?: string }>,
    res: Response
  ) {
    const userId = new mongoose.Types.ObjectId(req.token._id);
    let courseId: mongoose.Types.ObjectId | null = null;
    if (req.params.course) {
      if (mongoose.isValidObjectId(req.params.course)) {
        courseId = new mongoose.Types.ObjectId(req.params.course);
      } else {
        return res.status(GetUserPatronProfilesStatus.MissingArguments).send({
          message:
            'User Patron Profiles retrieval failed: an error occurred. [ERR105]',
        });
      }
    }
    const searchCriteria = courseId ? { course: courseId } : { user: userId };
    try {
      const userPatronProfiles = await UserPatronProfileModel.find(
        searchCriteria
      )
        .populate('userDetails', 'username role')
        .lean()
        .exec();
      if (!userPatronProfiles || userPatronProfiles.length === 0) {
        return res.status(GetUserPatronProfilesStatus.NoProfiles).send({
          message: 'No User Patron profiles to retrieve.',
          userPatronProfiles: [],
        });
      }
      return res.status(GetUserPatronProfilesStatus.Retrieved).send({
        message: 'User Patron profiles retrieved.',
        userPatronProfiles: userPatronProfiles,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetUserPatronProfilesStatus.InternalError).send({
        message:
          'User Patron Profiles retrieval failed: an error occurred. [ERR102]',
      });
    }
  },
  getCoursePatronProfiles: async function (
    req: Express.AuthenticatedRequest<{ course: string }>,
    res: Response
  ) {
    if (!req.params.course || !mongoose.isValidObjectId(req.params.course)) {
      return res.status(GetCoursePatronProfilesStatus.MissingArguments).send({
        message: 'Course Patron Profiles retrieval failed: parameter missing.',
      });
    }
    const courseId = new mongoose.Types.ObjectId(req.params.course);
    try {
      const coursePatronProfiles = await CoursePatronProfileModel.find({
        course: courseId,
      })
        .lean()
        .exec();
      if (!coursePatronProfiles || coursePatronProfiles.length === 0) {
        return res.status(GetCoursePatronProfilesStatus.NoProfiles).send({
          message:
            'Course Patron Profiles retrieval failed: no profiles found.',
        });
      }
      return res.status(GetCoursePatronProfilesStatus.Retrieved).send({
        message: 'Course Patron profiles retrieved.',
        coursePatronProfiles: coursePatronProfiles,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetCoursePatronProfilesStatus.InternalError).send({
        message:
          'Course Patron Profiles retrieval failed: an error occurred. [ERR100]',
      });
    }
  },
};

export default functions;
