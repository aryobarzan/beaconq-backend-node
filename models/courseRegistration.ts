import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";

export interface CourseRegistration {
  course: Types.ObjectId;
  user: Types.ObjectId;
  registrationDates: Date[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CourseRegistrationDocument = HydratedDocument<CourseRegistration>;

const courseRegistrationSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    registrationDates: [
      {
        type: Date,
        default: () => new Date(),
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { collection: "course_registrations", timestamps: true },
);
courseRegistrationSchema.index({ course: 1, user: 1 }, { unique: true });
courseRegistrationSchema.index(
  { course: 1, user: 1, isActive: 1 },
  { unique: false },
);

export const CourseRegistrationModel: Model<CourseRegistrationDocument> =
  mongoose.model<CourseRegistrationDocument>(
    "CourseRegistration",
    courseRegistrationSchema,
  );
