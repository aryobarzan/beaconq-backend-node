import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";
import crypto from "crypto";
import { schema as courseSessionSchema, CourseSession } from "./courseSession";
import {
  schema as beaconResourceSchema,
  BeaconResource,
} from "./beaconResource";
import { DateTime } from "luxon";
import { ScheduledQuiz } from "./scheduledQuiz";

export interface Course {
  title: string;
  description: string;
  isManualTopicFocus: boolean;
  registrationLimit?: number;
  accessKey: string;
  trialQuiz?: Types.ObjectId;
  restrictSubmissionInitially: boolean;
  integrations?: string[];
  sessions: CourseSession[];
  beaconResources: BeaconResource[];
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// instance (non-static) methods
export interface CourseMethods {
  getSessionOfScheduledQuiz(id: Types.ObjectId): CourseSession | null;
  getScheduledQuiz(id: Types.ObjectId): ScheduledQuiz | null;
  getScheduledQuizzes(): ScheduledQuiz[];
  getInitialEvaluationQuiz(): ScheduledQuiz | null;
  getScheduledQuizType(id: Types.ObjectId): "pre" | "immediate" | "post" | null;
}

export type CourseDocument = HydratedDocument<Course, CourseMethods>;

const courseSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    isManualTopicFocus: {
      type: Boolean,
      required: true,
      default: false,
    },
    registrationLimit: {
      type: Number,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
      required: false,
    },
    accessKey: {
      type: String,
      //required: true,
      unique: true,
      //default: crypto.randomBytes(4).toString("hex").toUpperCase(),
    },
    trialQuiz: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: false,
    },
    // Introduced with BEACON Q 6.2.0
    restrictSubmissionInitially: {
      type: Boolean,
      required: true,
      default: true,
    },
    integrations: [{ type: String }],
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    sessions: {
      type: [courseSessionSchema],
      default: [],
    },
    beaconResources: {
      type: [beaconResourceSchema],
      default: [],
    },
  },
  { collection: "courses", timestamps: true },
);
// To optimize ModelHelper.findCourseAndSession
courseSchema.index({ "sessions.scheduledQuizzes._id": 1 }, { unique: false });

courseSchema.pre("save", function (this: CourseDocument, next) {
  if (!this.accessKey) {
    this.accessKey = crypto.randomBytes(4).toString("hex").toUpperCase();
  }
  next();
});

courseSchema.method(
  "getSessionOfScheduledQuiz",
  function (this: CourseDocument, id: Types.ObjectId) {
    for (const session of this.sessions) {
      for (let scheduledQuiz of session.scheduledQuizzes) {
        if (scheduledQuiz._id.toString() === id.toString()) {
          return session;
        }
      }
    }
    return null;
  },
);

courseSchema.method(
  "getScheduledQuiz",
  function (this: CourseDocument, id: Types.ObjectId) {
    const session = this.getSessionOfScheduledQuiz(id);
    if (session) {
      for (let scheduledQuiz of session.scheduledQuizzes) {
        if (scheduledQuiz._id.toString() === id.toString()) {
          return scheduledQuiz;
        }
      }
    }
    return null;
  },
);

courseSchema.method(
  "getScheduledQuizzes",
  function (this: CourseDocument): ScheduledQuiz[] {
    return this.sessions
      .map((s) => s.scheduledQuizzes)
      .reduce(function (pre, cur) {
        return pre.concat(cur);
      }, []);
  },
);

/// "pre": pre-quiz (before session)
/// "immediate": first post-quiz following immediately after a session
/// "post": any subsequent post-quiz after the immediate post-quiz
courseSchema.method(
  "getScheduledQuizType",
  function (this: CourseDocument, id: Types.ObjectId) {
    const scheduledQuiz = this.getScheduledQuiz(id);
    if (!scheduledQuiz) {
      return null;
    }
    const session = this.getSessionOfScheduledQuiz(scheduledQuiz._id);
    if (session) {
      const sessionStartDateTime = DateTime.fromJSDate(session.startDateTime, {
        zone: "utc",
      });
      const scheduledQuizStartDateTime = DateTime.fromJSDate(
        scheduledQuiz.startDateTime,
        { zone: "utc" },
      );
      if (scheduledQuizStartDateTime < sessionStartDateTime) {
        return "pre";
      } else {
        for (const otherScheduledQuiz of session.scheduledQuizzes) {
          if (
            scheduledQuiz._id.toString() === otherScheduledQuiz._id.toString()
          ) {
            continue;
          } else {
            const otherQuizStartDateTime = DateTime.fromJSDate(
              otherScheduledQuiz.startDateTime,
            ).setZone("Europe/Paris");
            if (otherQuizStartDateTime < scheduledQuizStartDateTime) {
              return "post";
            }
          }
        }
        return "immediate";
      }
    }
    return null;
  },
);

export const CourseModel: Model<CourseDocument> =
  mongoose.model<CourseDocument>("Course", courseSchema);
