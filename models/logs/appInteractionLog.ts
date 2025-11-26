import mongoose, { HydratedDocument, Schema, Model } from 'mongoose';
// Deprecated as of 4.0.0, replaced by AppUserInteractionLog. Kept for backwards compatibility.

export interface AppInteractionLog {
  user: mongoose.Types.ObjectId;
  logType:
    | 'openIntegrationDartBlockPad'
    | 'openLighthouse'
    | 'openCourseBeaconResources'
    | 'openCourseAchievements'
    | 'viewTopicResources'
    | 'openCourseLeaderboard'
    | 'openPatronSelectionPage'
    | 'openCoursePatronLeaderboard';
  content?: string;
  interactionTimestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AppInteractionLogDocument = HydratedDocument<AppInteractionLog>;

const appInteractionLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    logType: {
      type: String,
      enum: [
        'openIntegrationDartBlockPad',
        'openLighthouse',
        'openCourseBeaconResources',
        'openCourseAchievements',
        'viewTopicResources',
        'openCourseLeaderboard',
        'openPatronSelectionPage',
        'openCoursePatronLeaderboard',
      ],
      required: true,
    },
    content: {
      type: String,
      default: 'N/A',
      required: false,
    },
    interactionTimestamp: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'app_interactions',
    timestamps: true,
  }
);
appInteractionLogSchema.index(
  {
    user: 1,
    interactionTimestamp: 1,
    logType: 1,
    content: 1,
  },
  { unique: true }
);

export const AppInteractionLogModel: Model<AppInteractionLogDocument> =
  mongoose.model<AppInteractionLogDocument>(
    'AppInteractionLog',
    appInteractionLogSchema
  );
