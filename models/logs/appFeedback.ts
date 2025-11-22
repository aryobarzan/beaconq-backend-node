import mongoose, { HydratedDocument, Schema, Model } from "mongoose";

export interface AppFeedback {
  user?: mongoose.Types.ObjectId;
  isAnonymous: boolean;
  message: string;
  appFeedbackType: string;
  includeLogFile: boolean;
  devicePlatform: string;
  appVersion: string;
  appBuildNumber: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AppFeedbackDocument = HydratedDocument<AppFeedback>;

const appFeedbackSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    isAnonymous: {
      type: Boolean,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    appFeedbackType: {
      type: String,
      required: true,
    },
    includeLogFile: {
      type: Boolean,
      required: true,
    },
    devicePlatform: {
      type: String,
      required: true,
    },
    appVersion: {
      type: String,
      required: true,
    },
    appBuildNumber: {
      type: String,
      required: true,
    },
  },
  { collection: "app_feedback", timestamps: true },
);

export const AppFeedbackModel: Model<AppFeedbackDocument> =
  mongoose.model<AppFeedbackDocument>("AppFeedback", appFeedbackSchema);

export default AppFeedbackModel;