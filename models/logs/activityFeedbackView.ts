import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';

export interface ActivityFeedbackView {
  user: Types.ObjectId;
  activity: Types.ObjectId;
  activityVersion: number;
  activityDifficulty: number;
  playContextId?: string;
  scheduledQuiz?: Types.ObjectId;
  timestamp: Date;
  serverTimestamp?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityFeedbackViewDocument =
  HydratedDocument<ActivityFeedbackView>;

const activityFeedbackViewSchema = new Schema(
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
    activityDifficulty: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 10,
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
    collection: 'activity_feedback_view',
    discriminatorKey: 'kind',
    timestamps: true,
  }
);
activityFeedbackViewSchema.index(
  {
    user: 1,
    activity: 1,
    timestamp: 1,
  },
  { unique: true }
);

export const ActivityFeedbackViewModel: Model<ActivityFeedbackViewDocument> =
  mongoose.model<ActivityFeedbackViewDocument>(
    'ActivityFeedbackView',
    activityFeedbackViewSchema
  );

// Choice Activity Feedback View

export interface ChoiceActivityFeedbackView extends ActivityFeedbackView {
  answer: string;
  feedback: string;
  isDistractor: boolean;
}

export type ChoiceActivityFeedbackViewDocument =
  HydratedDocument<ChoiceActivityFeedbackView>;

const choiceActivityFeedbackViewSchema = new Schema(
  {
    answer: {
      type: String,
      required: true,
    },
    feedback: {
      type: String,
      required: true,
    },
    isDistractor: {
      type: Boolean,
      required: true,
    },
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  {
    collection: 'activity_feedback_view',
    discriminatorKey: 'kind',
    timestamps: true,
  }
);

export const ChoiceActivityFeedbackViewModel: Model<ChoiceActivityFeedbackViewDocument> =
  ActivityFeedbackViewModel.discriminator<ChoiceActivityFeedbackViewDocument>(
    'ChoiceActivityFeedbackView',
    choiceActivityFeedbackViewSchema
  );

// DartBlock Activity Feedback View

export interface DartBlockActivityFeedbackView extends ActivityFeedbackView {
  feedbackViewType: string;
}
export type DartBlockActivityFeedbackViewDocument =
  HydratedDocument<DartBlockActivityFeedbackView>;

const dartBlockActivityFeedbackViewSchema = new Schema(
  {
    feedbackViewType: {
      type: String,
      required: true,
    },
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  {
    collection: 'activity_feedback_view',
    discriminatorKey: 'kind',
    timestamps: true,
  }
);

export const DartBlockActivityFeedbackViewModel: Model<DartBlockActivityFeedbackViewDocument> =
  ActivityFeedbackViewModel.discriminator<DartBlockActivityFeedbackViewDocument>(
    'DartBlockActivityFeedbackView',
    dartBlockActivityFeedbackViewSchema
  );
