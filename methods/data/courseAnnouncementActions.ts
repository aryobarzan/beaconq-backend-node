import {
  CourseAnnouncementDocument,
  CourseAnnouncementModel,
} from "../../models/courseAnnouncement";
import { PermissionModel, hasPermissions } from "../../models/permission";
import mongoose from "mongoose";
import logger from "../../middleware/logger";
import { Response } from "express";

// Possible status codes
enum CreateOrUpdateCourseAnnouncementStatus {
  Created = 200,
  Updated = 209,
  MissingArguments = 400,
  InternalError = 500,
}
enum GetCourseAnnouncementsStatus {
  Retrieved = 200,
  MissingArguments = 400,
  InternalError = 500,
}

class CreateOrUpdateCourseAnnouncementPermissionError extends Error {
  constructor() {
    super("Lacking permission to update");
    this.name = "CreateOrUpdateCourseAnnouncementPermissionError";
    Object.setPrototypeOf(
      this,
      CreateOrUpdateCourseAnnouncementPermissionError.prototype,
    );
  }
}

const functions = {
  createOrUpdateCourseAnnouncement: async function (
    req: Express.AuthenticatedRequest<{}, {}, { courseAnnouncement: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message:
          "Course announcement creation failed: only teachers are authorized.",
      });
    }
    if (!req.body.courseAnnouncement) {
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.MissingArguments)
        .send({
          message: "Course announcement creation failed: parameter missing.",
        });
    }

    let incomingAnnouncement: CourseAnnouncementDocument;
    try {
      incomingAnnouncement = JSON.parse(req.body.courseAnnouncement);
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.MissingArguments)
        .send({
          message: "Course announcement creation failed: invalid JSON.",
        });
    }

    incomingAnnouncement.author = new mongoose.Types.ObjectId(req.token._id);

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.InternalError)
        .send({
          message:
            "Course announcement creation failed: internal error (session).",
        });
    }

    try {
      let responseStatus: number =
        CreateOrUpdateCourseAnnouncementStatus.Updated;
      let savedAnnouncement: CourseAnnouncementDocument | undefined;

      await session.withTransaction(async () => {
        let existingAnnouncement: CourseAnnouncementDocument | null = null;
        if (incomingAnnouncement._id) {
          existingAnnouncement = await CourseAnnouncementModel.findById(
            incomingAnnouncement._id,
          )
            .session(session)
            .exec();
        }

        if (!existingAnnouncement) {
          // Create new announcement
          const newAnnouncement = new CourseAnnouncementModel(
            incomingAnnouncement,
          );
          savedAnnouncement = await newAnnouncement.save({ session });

          // Create permission for the creator within same transaction
          const perm = new PermissionModel({
            user: req.token._id,
            resourceType: "COURSE_ANNOUNCEMENT",
            resource: savedAnnouncement._id,
            level: PermissionLevel.EXECUTE,
          });
          await perm.save({ session });

          responseStatus = CreateOrUpdateCourseAnnouncementStatus.Created;
        } else {
          // Update existing course announcement

          // Does the teacher have permission to update the existing activity
          const permission = await PermissionModel.findOne({
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
            throw new CreateOrUpdateCourseAnnouncementPermissionError();
          }

          const newAnnouncement = new CourseAnnouncementModel(
            incomingAnnouncement,
          );
          newAnnouncement.version = existingAnnouncement.version + 1;
          /// Set {new: true} such that the updated model is returned by mongoose
          const updatedAnnouncement =
            await CourseAnnouncementModel.findByIdAndUpdate(
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
        courseAnnouncement: savedAnnouncement.toJSON(),
      });
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof CreateOrUpdateCourseAnnouncementPermissionError) {
        return res.status(403).send({ message: err.message });
      }
      return res
        .status(CreateOrUpdateCourseAnnouncementStatus.InternalError)
        .send({
          message: `Course announcement creation failed: internal error. (${err})`,
        });
    } finally {
      session.endSession();
    }
  },
  getCourseAnnouncements: async function (
    req: Express.AuthenticatedRequest<
      { courseId: string },
      {},
      {},
      { recentOnly?: string }
    >,
    res: Response,
  ) {
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
    const courseId = new mongoose.Types.ObjectId(req.params.courseId);
    let searchConditions: any[] = [{ course: courseId }];
    if (String(req.query.recentOnly).toLowerCase() === "true") {
      const currentDate = new Date();
      const endDate = new Date(currentDate);
      endDate.setDate(currentDate.getDate() + 28);
      searchConditions.push({
        $and: [
          { dateTime: { $ne: null } },
          { dateTime: { $gte: currentDate, $lt: endDate } },
        ],
      });
    }

    try {
      const courseAnnouncements = await CourseAnnouncementModel.find({
        $and: searchConditions,
      })
        .lean()
        .exec();
      return res.status(GetCourseAnnouncementsStatus.Retrieved).send({
        message: "Course announcements retrieved.",
        courseAnnouncements: courseAnnouncements,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetCourseAnnouncementsStatus.InternalError).send({
        message:
          "Course announcements fetching for course(s) failed: a search error occurred.",
      });
    }
  },
  getCourseAnnouncementsForCourses: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { courseIds: string; recentOnly: string }
    >,
    res: Response,
  ) {
    if (!req.body.courseIds) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message:
          "Course announcement fetching for course(s) failed: course IDs missing. [ERR924]",
      });
    }
    let courseIds: string[];
    try {
      courseIds = JSON.parse(req.body.courseIds);
      if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
        return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
          message:
            "Course announcement fetching for course(s) failed: course IDs missing. [ERR924B]",
        });
      }
    } catch (err: unknown) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message:
          "Course announcement fetching for course(s) failed: course IDs missing. [ERR924C]",
      });
    }

    const validCourseObjectIds = courseIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validCourseObjectIds.length === 0) {
      return res.status(GetCourseAnnouncementsStatus.MissingArguments).send({
        message:
          "Course announcement fetching for course(s) failed: no valid course IDs provided.",
      });
    }

    let searchConditions: any[] = [{ course: { $in: validCourseObjectIds } }];
    if (String(req.body.recentOnly).toLowerCase() === "true") {
      const currentDate = new Date();
      const endDate = new Date(currentDate);
      endDate.setDate(currentDate.getDate() + 28);
      searchConditions.push({
        $and: [
          { dateTime: { $ne: null } },
          { dateTime: { $gte: currentDate, $lt: endDate } },
        ],
      });
    }
    try {
      const courseAnnouncements = await CourseAnnouncementModel.find({
        $and: searchConditions,
      })
        .lean()
        .exec();
      return res.status(GetCourseAnnouncementsStatus.Retrieved).send({
        message: "Course announcements retrieved.",
        courseAnnouncements: courseAnnouncements,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetCourseAnnouncementsStatus.InternalError).send({
        message:
          "Course announcements fetching for course(s) failed: a search error occurred.",
      });
    }
  },
};

export default functions;
