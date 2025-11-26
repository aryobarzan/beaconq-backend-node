import mongoose, { HydratedDocument, Schema, Model } from 'mongoose';
// New as of 4.0.0, replaces old AppInteractionLog

export interface AppUserInteractionLog {
  user: mongoose.Types.ObjectId;
  clientTimestamp: Date;
  course?: mongoose.Types.ObjectId;
  interactionType: string;
  content?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AppUserInteractionLogDocument =
  HydratedDocument<AppUserInteractionLog>;

const appUserInteractionLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    clientTimestamp: {
      type: Date,
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: false,
    },
    interactionType: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: 'N/A',
      required: false,
    },
  },
  {
    collection: 'app_user_interactions',
  }
);

export const AppUserInteractionLogModel: Model<AppUserInteractionLogDocument> =
  mongoose.model<AppUserInteractionLogDocument>(
    'AppUserInteractionLog',
    appUserInteractionLogSchema
  );
