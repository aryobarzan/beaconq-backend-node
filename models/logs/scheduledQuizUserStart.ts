import mongoose, { HydratedDocument, Schema, Model } from 'mongoose';

export interface ScheduledQuizUserStart {
  user: mongoose.Types.ObjectId;
  scheduledQuiz: mongoose.Types.ObjectId;
  timestamp: Date;
  serverTimestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ScheduledQuizUserStartDocument =
  HydratedDocument<ScheduledQuizUserStart>;

const scheduledQuizUserStartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduledQuiz',
      required: true,
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
    collection: 'scheduled_quiz_user_start',
    discriminatorKey: 'kind',
    timestamps: true,
  }
);
scheduledQuizUserStartSchema.index(
  { scheduledQuiz: 1, user: 1 },
  { unique: true }
);

export const ScheduledQuizUserStartModel: Model<ScheduledQuizUserStartDocument> =
  mongoose.model<ScheduledQuizUserStartDocument>(
    'ScheduledQuizUserStart',
    scheduledQuizUserStartSchema
  );
