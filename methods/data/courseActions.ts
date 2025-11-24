import logger from "../../middleware/logger";
import { Response } from "express";
import { PermissionModel, hasPermissions } from "../../models/permission";
import { CourseDocument, CourseModel } from "../../models/course";
import {
  CourseRegistrationDocument,
  CourseRegistrationModel,
} from "../../models/courseRegistration";
import ModelHelper from "../../middleware/modelHelper";
import firebaseHelper from "../../middleware/firebaseHelper";
import mongoose from "mongoose";

// Possible status codes
enum CreateOrUpdateCourseStatus {
  Created = 200,
  Updated = 209,
  MissingArguments = 400,
  InternalError = 500,
}
enum GetCoursesStatus {
  Retrieved = 200,
  None = 209,
  InternalError = 500,
}
enum RegisterCourseStatus {
  Registered = 200,
  AlreadyRegistered = 209,
  MissingArgument = 400,
  InvalidAccessKey = 452,
  LimitReached = 453,
  InternalError = 500,
}
enum UnregisterCourseStatus {
  Unregistered = 200,
  NotRegistered = 209,
  MissingArgument = 400,
  InvalidCourseId = 452,
  InternalError = 500,
}
enum GetRegisteredCoursesStatus {
  Retrieved = 200,
  None = 209,
  InternalError = 500,
}
enum GetRegisteredUsersStatus {
  Retrieved = 200,
  None = 209,
  MissingArgument = 400,
  InternalError = 500,
}
// Possible status codes

class CourseRegistrationLimitReachedError extends Error {
  constructor() {
    super("Course registration limit reached");
    this.name = "CourseRegistrationLimitReachedError";
    Object.setPrototypeOf(this, CourseRegistrationLimitReachedError.prototype);
  }
}

class CreateOrUpdateCoursePermissionError extends Error {
  constructor() {
    super("Lacking permission to update");
    this.name = "CreateOrUpdateCoursePermissionError";
    Object.setPrototypeOf(this, CreateOrUpdateCoursePermissionError.prototype);
  }
}

const functions = {
  createOrUpdateCourse: async function (
    req: Express.AuthenticatedRequest<{}, {}, { course: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: "Course creation failed: only teachers are authorized.",
      });
    }
    if (!req.body.course) {
      return res
        .status(CreateOrUpdateCourseStatus.MissingArguments)
        .send({ message: "Course creation failed: course parameter missing." });
    }

    let newCourse: CourseDocument;
    try {
      newCourse = new CourseModel(JSON.parse(req.body.course));
    } catch (err: unknown) {
      return res.status(CreateOrUpdateCourseStatus.InternalError).send({
        message:
          "Course creation failed: course could not be parsed/deserialized.",
      });
    }

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      return res.status(CreateOrUpdateCourseStatus.InternalError).send({
        message: `Course creation/update failed: internal error (session). (${err})`,
      });
    }

    let responseStatusCode: number = CreateOrUpdateCourseStatus.Updated;
    let result: CourseDocument | null = null;

    try {
      await session.withTransaction(async () => {
        const existingCourse = await CourseModel.findById(newCourse._id)
          .session(session)
          .exec();

        if (!existingCourse) {
          // New course
          responseStatusCode = CreateOrUpdateCourseStatus.Created;
          const savedCourse = await newCourse.save({ session });
          await new PermissionModel({
            user: req.token._id,
            resourceType: "COURSE",
            resource: savedCourse._id,
            level: PermissionLevel.EXECUTE,
          }).save({ session });

          const populatedCourse = await ModelHelper.populateCourse(savedCourse);
          if (!populatedCourse) {
            throw new Error(
              "Course created but failed to populate course properties.",
            );
          }
          result = populatedCourse as CourseDocument;
        }
        // update existing course
        else {
          // Does the teacher have permission to update the existing activity
          const permission = await PermissionModel.findOne({
            user: req.token._id,
            resource: existingCourse._id,
            resourceType: "COURSE",
          })
            .session(session)
            .lean()
            .exec();
          if (
            !permission ||
            !Number.isInteger(permission.level) ||
            !hasPermissions(["write"], permission.level)
          ) {
            throw new CreateOrUpdateCoursePermissionError();
          }

          newCourse.version = existingCourse.version + 1;
          const updatedCourse = await CourseModel.findByIdAndUpdate(
            existingCourse._id,
            newCourse,
            { new: true, session },
          ).exec();
          if (!updatedCourse) {
            throw new Error("Failed to update course");
          }

          logger.info("Updated course: " + updatedCourse._id);
          const populatedCourse =
            await ModelHelper.populateCourse(updatedCourse);
          if (!populatedCourse) {
            throw new Error(
              "Course updated but failed to populate course properties.",
            );
          }
          result = populatedCourse as CourseDocument;
        }
      });
      if (result) {
        // Re-initialize the push notification jobs for this course's scheduled quizzes.
        // No need to wait for this to finish.
        firebaseHelper.refreshCourseNotifications(result._id);
        const message =
          responseStatusCode == CreateOrUpdateCourseStatus.Created
            ? "Course created."
            : "Course updated.";
        return res.status(responseStatusCode).send({
          message: message,
          course: result.toJSON(),
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof CreateOrUpdateCoursePermissionError) {
        return res.status(403).send({ message: err.message });
      }
      return res.status(CreateOrUpdateCourseStatus.InternalError).send({
        message: `Course creation/update failed: internal error. (${err})`,
      });
    } finally {
      session.endSession();
    }
  },
  getCourses: async function (
    req: Express.AuthenticatedRequest,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: "Course fetching failed: only teachers are authorized.",
      });
    }
    try {
      const courses = await CourseModel.aggregate([
        {
          $lookup: {
            from: "permissions",
            localField: "_id",
            foreignField: "resource",
            as: "permissions",
          },
        },
        {
          $match: {
            permissions: {
              // Important to use $elemMatch such that the same Permission document is used for these field checks
              $elemMatch: {
                resourceType: "COURSE",
                user: new mongoose.Types.ObjectId(req.token._id),
                level: { $gte: PermissionLevel.READ },
              },
            },
          },
        },
        { $unset: ["permissions"] },
      ]).exec();
      if (!courses || courses.length === 0) {
        return res
          .status(GetCoursesStatus.None)
          .send({ message: "Course fetching failed: no courses found." });
      }
      const populatedCourses = await ModelHelper.populateCourse(courses);
      if (!populatedCourses) {
        return res.status(GetCoursesStatus.InternalError).send({
          message:
            "Course fetching failed: failed to populate course properties.",
        });
      }
      return res.status(GetCoursesStatus.Retrieved).send({
        courses: Array.isArray(populatedCourses)
          ? populatedCourses.map((c) => c.toJSON())
          : populatedCourses.toJSON(),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetCoursesStatus.InternalError).send({
        message:
          "Course fetching failed: failed to populate course properties. (error)",
      });
    }
  },

  // User (Student) actions
  registerToCourse: async function (
    req: Express.AuthenticatedRequest<{}, {}, { accessKey: string }>,
    res: Response,
  ) {
    if (!req.body.accessKey) {
      return res.status(RegisterCourseStatus.MissingArgument).send({
        message: "Course registration failed: access key was not indicated.",
      });
    }

    const accessKey = String(req.body.accessKey).toUpperCase();

    let course: CourseDocument | null;
    try {
      course = await CourseModel.findOne({ accessKey }).exec();
    } catch (err: unknown) {
      logger.error(err);
      return res.status(RegisterCourseStatus.InvalidAccessKey).send({
        message: `Course registration failed: error while searching for access key ${accessKey}`,
      });
    }
    if (!course) {
      logger.warn(
        `Course registration failed: access key ${accessKey} not found.`,
      );
      return res.status(RegisterCourseStatus.InvalidAccessKey).send({
        message: `Course registration failed: a course with the access key ${accessKey} does not exist.`,
      });
    }

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      return res.status(RegisterCourseStatus.InternalError).send({
        message: `Course registration failed: internal error (session).`,
      });
    }
    try {
      let registrationResult: {
        status: RegisterCourseStatus;
        registration?: CourseRegistrationDocument;
      };
      await session.withTransaction(async () => {
        // count active registrations for the course
        const registrationLimit = Math.max(1, course.registrationLimit || 1000);
        const activeCount = await CourseRegistrationModel.countDocuments({
          course: course._id,
          isActive: true,
        })
          .session(session)
          .exec();

        // is the user already registered for the course
        let existing = await CourseRegistrationModel.findOne({
          course: course._id,
          user: req.token._id,
        })
          .session(session)
          .exec();

        if (existing) {
          if (existing.isActive) {
            // already registered, don't have to do anything
            registrationResult = {
              status: RegisterCourseStatus.AlreadyRegistered,
              registration: existing,
            };
            return;
          }
          // previously registered, but their registration is currently inactive.
          // Note that only students can register / re-active their registration.
          if (
            activeCount >= registrationLimit &&
            req.token.role === UserRole.STUDENT
          ) {
            // limit reached, cannot reactivate
            throw new CourseRegistrationLimitReachedError();
          }
          // reactivate registration
          existing.isActive = true;
          existing.registrationDates = existing.registrationDates || [];
          existing.registrationDates.push(new Date());
          const savedRegistration = await existing.save({ session });
          registrationResult = {
            status: RegisterCourseStatus.Registered,
            registration: savedRegistration,
          };
          return;
        }

        // no existing registration
        if (
          activeCount >= registrationLimit &&
          req.token.role === UserRole.STUDENT
        ) {
          throw new CourseRegistrationLimitReachedError();
        }

        const newReg = new CourseRegistrationModel({
          course: course._id,
          user: req.token._id,
          registrationDates: [new Date()],
          isActive: true,
        });
        const savedRegistration = await newReg.save({ session });
        registrationResult = {
          status: RegisterCourseStatus.Registered,
          registration: savedRegistration,
        };
      });

      let populatedCourse = await ModelHelper.populateCourse(course);
      if (!populatedCourse) {
        return res.status(RegisterCourseStatus.InternalError).send({
          message:
            "Course registration succeeded but failed to populate course.",
        });
      }
      populatedCourse = populatedCourse as CourseDocument;
      // Note: we don't send the CourseRegistration object as part of the response, as currently the client just expects the Course object itself.
      if (
        registrationResult.status === RegisterCourseStatus.AlreadyRegistered
      ) {
        return res.status(RegisterCourseStatus.AlreadyRegistered).send({
          course: populatedCourse.toJSON(),
        });
      }
      // Registered
      return res.status(RegisterCourseStatus.Registered).send({
        course: populatedCourse.toJSON(),
      });
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof CourseRegistrationLimitReachedError) {
        return res.status(RegisterCourseStatus.LimitReached).send({
          message: "Course registration limit reached.",
        });
      }

      // Duplicate key (race condition)
      if (
        err &&
        err instanceof mongoose.mongo.MongoError &&
        err.code === 11000
      ) {
        return res.status(RegisterCourseStatus.AlreadyRegistered).send({
          message: "Course registration: user already registered.",
        });
      }
      // unknown error
      return res.status(RegisterCourseStatus.InternalError).send({
        message: `Course registration failed: internal error. (${err})`,
      });
    } finally {
      session.endSession();
    }
  },
  deregisterFromCourse: async function (
    req: Express.AuthenticatedRequest<{}, {}, { courseId: string }>,
    res: Response,
  ) {
    if (!req.body.courseId) {
      logger.warn("Course deregistration failed: course id was not indicated.");
      return res.status(UnregisterCourseStatus.MissingArgument).send({
        message: "Course deregistration failed: course id was not indicated.",
      });
    }
    if (!mongoose.isValidObjectId(req.body.courseId)) {
      return res.status(UnregisterCourseStatus.InvalidCourseId).send({
        message: "Course deregistration failed: course id is invalid.",
      });
    }
    const courseId = new mongoose.Types.ObjectId(req.body.courseId);
    try {
      const updatedCourseRegistration =
        await CourseRegistrationModel.findOneAndUpdate(
          { course: courseId, user: req.token._id, isActive: true },
          { $set: { isActive: false } },
          { new: true },
        ).exec();

      if (!updatedCourseRegistration) {
        // either not registered or the existing CourseRegistration is already inactive
        return res.status(UnregisterCourseStatus.NotRegistered).send({
          message: "Course deregistration failed: user is not registered.",
        });
      }

      return res.status(UnregisterCourseStatus.Unregistered).send({
        message: "Deregistered from the course.",
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(UnregisterCourseStatus.InternalError).send({
        message: `Course deregistration failed: internal error. (${err})`,
      });
    }
  },
  getRegisteredCoursesForUser: async function (
    req: Express.AuthenticatedRequest<{}, {}, {}, { metadataOnly?: string }>,
    res: Response,
  ) {
    const userId = new mongoose.Types.ObjectId(req.token._id);

    try {
      // we lookup only the user's active CourseRegistrations and then keep only Courses
      // which have such an associated CourseRegistration that is active.
      const courses = await CourseModel.aggregate([
        {
          $lookup: {
            from: "course_registrations",
            let: { courseId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      // $$courseId is the _id field of the current Course that is being matched against the CourseRegistration documents.
                      // This stems from the earlier " let: { courseId: "$_id" }"
                      { $eq: ["$course", "$$courseId"] },
                      { $eq: ["$user", userId] },
                      { $eq: ["$isActive", true] },
                    ],
                  },
                },
              },
            ],
            as: "registrations",
          },
        },
        // only keep courses where the lookup produced at least one registration for the user
        { $match: { registrations: { $ne: [] } } },
        // remove the temporary registrations array
        { $unset: ["registrations"] },
      ]).exec();

      if (!courses || courses.length === 0) {
        return res
          .status(GetRegisteredCoursesStatus.None)
          .send({ message: "No registered courses found." });
      }

      // The client doesn't want the courses populated.
      if (
        req.query.metadataOnly &&
        String(req.query.metadataOnly).toLowerCase() === "true"
      ) {
        return res.status(GetRegisteredCoursesStatus.Retrieved).send({
          message: "Registered courses downloaded.",
          courses: courses.map((c) => c.toJSON()),
        });
      }

      // Populate courses
      let populatedCourses = await ModelHelper.populateCourse(courses);
      if (!populatedCourses) {
        return res.status(GetRegisteredCoursesStatus.InternalError).send({
          message:
            "Registered courses could not be downloaded: error when populating.",
        });
      }
      populatedCourses = populatedCourses as CourseDocument[];
      return res.status(GetRegisteredCoursesStatus.Retrieved).send({
        message: "Registered courses downloaded.",
        courses: populatedCourses.map((c) => c.toJSON()),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetRegisteredCoursesStatus.InternalError).send({
        message:
          "Registered courses could not be downloaded: error when populating.",
      });
    }
  },
  getDemoCourseAccessKey: function (
    _: Express.AuthenticatedRequest,
    res: Response,
  ) {
    return res.status(200).send({
      accessKey: "90EA53F0",
      message: "Demo course access key retrieved.",
    });
  },
  // For teachers
  getUserRegistrationsForCourse: async function (
    req: Express.AuthenticatedRequest<{ courseId: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message:
          "Fetching registered users for course failed: only teachers are authorized.",
      });
    }
    if (!req.params.courseId) {
      return res.status(GetRegisteredUsersStatus.MissingArgument).send({
        message: "Course registered users fetching failed: missing course id.",
      });
    }
    if (!mongoose.isValidObjectId(req.params.courseId)) {
      return res.status(GetRegisteredUsersStatus.InternalError).send({
        message: "Course registered users fetching failed: invalid course id.",
      });
    }
    try {
      const course = await CourseModel.findById(
        new mongoose.Types.ObjectId(req.params.courseId),
      ).exec();
      if (!course) {
        return res.status(GetRegisteredUsersStatus.None).send({
          message:
            "Course registered users fetching failed: course could not be found.",
        });
      }

      const courseRegistrations = await CourseRegistrationModel.find({
        course: course._id,
      })
        .populate("user", "username role")
        .lean()
        .exec();
      if (!courseRegistrations || courseRegistrations.length === 0) {
        return res.status(GetRegisteredUsersStatus.None).send({
          message: "No user registrations available for that course.",
        });
      }
      return res
        .status(GetRegisteredUsersStatus.Retrieved)
        .send({ registrations: courseRegistrations });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetRegisteredUsersStatus.InternalError).send({
        message: "Course registered users fetching failed: internal error.",
      });
    }
  },
};

export default functions;
