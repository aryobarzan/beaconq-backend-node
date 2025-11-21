import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";

export interface CoursePatronProfile {
  course?: Types.ObjectId;
  patron: string;
  contributionCount: number;
  score: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CoursePatronProfileDocument = HydratedDocument<CoursePatronProfile>;

const coursePatronProfileSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    patron: {
      type: String,
      required: true,
    },
    contributionCount: {
      type: Number,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
  },
  { collection: "course_patron_profiles", timestamps: true },
);
coursePatronProfileSchema.index({ patron: 1, course: 1 }, { unique: true });

export const CoursePatronProfileModel: Model<CoursePatronProfileDocument> =
  mongoose.model<CoursePatronProfileDocument>(
    "CoursePatronProfile",
    coursePatronProfileSchema,
  );
