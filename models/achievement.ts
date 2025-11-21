import mongoose, { Schema, HydratedDocument, Model, Types } from "mongoose";

export interface Achievement {
  title: string;
  description: string;
  points: number;
  course?: Types.ObjectId;
  hideDescription: boolean;
  criteria: Map<string, number>;
  author: Types.ObjectId;
  version: number;
}

export type AchievementDocument = HydratedDocument<Achievement>;

const achievementSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    points: {
      type: Number,
      required: true,
      min: 25,
      max: 150,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    hideDescription: {
      type: Boolean,
      default: false,
      required: true,
    },
    criteria: {
      type: Map,
      required: true,
      of: Number,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
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
  },
  { collection: "achievements", timestamps: true },
);
const AchievementModel: Model<AchievementDocument> =
  mongoose.model<AchievementDocument>("Achievement", achievementSchema);

export { achievementSchema as schema, AchievementModel as model };
