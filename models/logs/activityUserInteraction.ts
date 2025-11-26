import mongoose, { HydratedDocument, Schema, Model } from 'mongoose';

export interface ActivityUserInteraction {
  user: mongoose.Types.ObjectId;
  activity: mongoose.Types.ObjectId;
  activityVersion: number;
  playContextId?: string;
  scheduledQuiz?: mongoose.Types.ObjectId;
  type: 'viewedHints' | 'viewedPointers';
  content?: string;
  timestamp: Date;
  serverTimestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityUserInteractionDocument =
  HydratedDocument<ActivityUserInteraction>;

const activityUserInteractionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    activity: {
      type: Schema.Types.ObjectId,
      ref: 'Activity',
      required: true,
    },
    activityVersion: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value',
      },
    },
    playContextId: {
      type: String,
      required: false,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduledQuiz',
      required: false,
    },
    type: {
      type: String,
      enum: ['viewedHints', 'viewedPointers'],
      required: true,
    },
    content: {
      type: String,
      default: 'N/A',
      required: false,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    serverTimestamp: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
  },
  {
    collection: 'activity_user_interactions',
    timestamps: true,
  }
);
activityUserInteractionSchema.index(
  {
    user: 1,
    activity: 1,
    timestamp: 1,
    type: 1,
    content: 1,
  },
  { unique: true }
);

export const ActivityUserInteractionModel: Model<ActivityUserInteractionDocument> =
  mongoose.model<ActivityUserInteractionDocument>(
    'ActivityUserInteraction',
    activityUserInteractionSchema
  );
