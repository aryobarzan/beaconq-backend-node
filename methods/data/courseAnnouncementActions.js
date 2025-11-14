var CourseAnnouncement = require("../../models/courseAnnouncement");
const { Permission, hasPermissions } = require("../../models/permission");
var mongoose = require("mongoose");
const logger = require("../../middleware/logger");

// Possible status codes
const CreateOrUpdateCourseAnnouncementStatus = Object.freeze({
  Created: 200,
  Updated: 209,
  MissingArguments: 400,
  InternalError: 500,
});
const GetCourseAnnouncementsStatus = Object.freeze({
  Retrieved: 200,
  MissingArguments: 400,
  InternalError: 500,
});

var functions = {
  createOrUpdateCourseAnnouncement: async function (req, res) {
    if (!req.body.courseAnnouncement) {
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.MissingArguments)
        .send({
          message: "Course announcement creation failed: parameter missing.",
        });
    }
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message:
          "Course announcement creation failed: only teachers are authorized.",
      });
    }

    let incomingAnnouncement;
    try {
      incomingAnnouncement = JSON.parse(req.body.courseAnnouncement);
    } catch (err) {
      logger.error(err);
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.MissingArguments)
        .send({
          message: "Course announcement creation failed: invalid JSON.",
        });
    }

    incomingAnnouncement.author = req.token._id;

    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      logger.error(err);
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.InternalError)
        .send({
          message:
            "Course announcement creation failed: internal error (session).",
        });
    }

    try {
      let responseStatus = CreateOrUpdateCourseAnnouncementStatus.Updated;
      let savedAnnouncement;

      await session.withTransaction(async () => {
        let existingAnnouncement = null;
        if (incomingAnnouncement._id) {
          existingAnnouncement = await CourseAnnouncement.findById(
            incomingAnnouncement._id,
          )
            .session(session)
            .exec();
        }

        if (!existingAnnouncement) {
          // Create new announcement
          const newAnnouncement = new CourseAnnouncement(incomingAnnouncement);
          savedAnnouncement = await newAnnouncement.save({ session });

          // Create permission for the creator within same transaction
          const perm = new Permission({
            user: req.token._id,
            resourceType: "COURSE_ANNOUNCEMENT",
            resource: savedAnnouncement._id,
            level: 7,
          });
          await perm.save({ session });

          responseStatus = CreateOrUpdateCourseAnnouncementStatus.Created;
        } else {
          // Update existing course announcement

          // Does the teacher have permission to update the existing activity
          const permission = await Permission.findOne({
            user: req.token._id,
            resource: existingAnnouncement._id,
            resourceType: "COURSE_ANNOUNCEMENT",
          })
            .session(session)
            .lean()
            .exec();
          if (
            !permission ||
            !Number.isInteger(permission.level) ||
            !hasPermissions(["write"], permission.level)
          ) {
            const err = new Error("Lacking permission to update");
            err.status = 403; // known status code for "forbidden"
            throw err;
          }

          const newAnnouncement = new CourseAnnouncement(incomingAnnouncement);
          newAnnouncement.version = existingAnnouncement.version + 1;
          /// Set {new: true} such that the updated model is returned by mongoose
          const updatedAnnouncement =
            await CourseAnnouncement.findByIdAndUpdate(
              existingAnnouncement._id,
              newAnnouncement,
              { new: true, runValidators: true, session },
            ).exec();
          if (!updatedAnnouncement) {
            throw new Error("Failed to update course announcement");
          }
          logger.info(
            "Updated course announcement: " + updatedAnnouncement._id,
          );

          savedAnnouncement = updatedAnnouncement;
          responseStatus = CreateOrUpdateCourseAnnouncementStatus.Updated;
        }
      });

      if (!savedAnnouncement) {
        logger.error(
          "Course announcement transaction completed but no announcement was returned.",
        );
        return res
          .status(CreateOrUpdateCourseAnnouncementStatus.InternalError)
          .send({
            message: "Course announcement creation failed: unknown error.",
          });
      }

      return res.status(responseStatus).send({
        message:
          responseStatus === CreateOrUpdateCourseAnnouncementStatus.Created
            ? "Course announcement created."
            : "Course announcement updated.",
        courseAnnouncement: JSON.stringify(savedAnnouncement),
      });
    } catch (err) {
      logger.error(err);
      if (err && err.status && Number.isInteger(err.status)) {
        return res.status(err.status).send({ message: err.message });
      }
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.InternalError)
        .send({
          message: `Course announcement creation failed: internal error. (${err})`,
        });
    } finally {
      if (session) session.endSession();
    }
  },
  getCourseAnnouncements: async function (req, res) {
    if (!req.params.courseId) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message: "Course announcements fetching failed: parameter missing.",
      });
    }
    if (!mongoose.isValidObjectId(req.params.courseId)) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message: "Course announcements fetching failed: parameter missing.",
      });
    }
    const courseId = mongoose.Types.ObjectId(req.params.courseId);
    var searchConditions = [{ course: courseId }];
    if (req.query.recentOnly) {
      const currentDate = new Date();
      var endDate = new Date(currentDate);
      endDate.setDate(currentDate.getDate() + 28);
      searchConditions.push({
        $and: [
          { dateTime: { $ne: null } },
          { dateTime: { $gte: currentDate, $lt: endDate } },
        ],
      });
    }

    try {
      const courseAnnouncements = await CourseAnnouncement.find({
        $and: searchConditions,
      })
        .lean()
        .exec();
      return res.status(GetCourseAnnouncementsStatus.Retrieved).send({
        message: "Course announcements retrieved.",
        courseAnnouncements: JSON.parse(JSON.stringify(courseAnnouncements)),
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetCourseAnnouncementsStatus.InternalError).send({
        message:
          "Course announcements fetching for course(s) failed: a search error occurred.",
      });
    }
  },
  getCourseAnnouncementsForCourses: async function (req, res) {
    if (!req.body.courseIds) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message:
          "Course announcement fetching for course(s) failed: course IDs missing. [ERR924]",
      });
    }
    let courseIds;
    try {
      courseIds = JSON.parse(req.body.courseIds);
      if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
        return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
          message:
            "Course announcement fetching for course(s) failed: course IDs missing. [ERR924B]",
        });
      }
    } catch (err) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message:
          "Course announcement fetching for course(s) failed: course IDs missing. [ERR924C]",
      });
    }

    const validCourseObjectIds = courseIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => mongoose.Types.ObjectId(id));

    if (validCourseObjectIds.length === 0) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message:
          "Course announcement fetching for course(s) failed: no valid course IDs provided.",
      });
    }

    let searchConditions = [{ course: { $in: validCourseObjectIds } }];
    if (String(req.body.recentOnly).toLowerCase() === "true") {
      const currentDate = new Date();
      var endDate = new Date(currentDate);
      endDate.setDate(currentDate.getDate() + 28);
      searchConditions.push({
        $and: [
          { dateTime: { $ne: null } },
          { dateTime: { $gte: currentDate, $lt: endDate } },
        ],
      });
    }
    try {
      const courseAnnouncements = await CourseAnnouncement.find({
        $and: searchConditions,
      })
        .lean()
        .exec();
      return res.status(GetCourseAnnouncementsStatus.Retrieved).send({
        message: "Course announcements retrieved.",
        // TODO: necessary?
        courseAnnouncements: JSON.parse(JSON.stringify(courseAnnouncements)),
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetCourseAnnouncementsStatus.InternalError).send({
        message:
          "Course announcements fetching for course(s) failed: a search error occurred.",
      });
    }
  },
};

module.exports = functions;
