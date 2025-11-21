import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";

export interface PlayContext {
  contextId: string;
  user: Types.ObjectId;
  playType:
    | "trialQuiz"
    | "scheduledQuiz"
    | "review"
    | "challengeReview"
    | "test"
    | "unlock";
  descriptor?: string;
  activities: Types.ObjectId[];
  topics?: Types.ObjectId[];
  course?: Types.ObjectId;
  courseSessions?: Types.ObjectId[];
  scheduledQuiz?: Types.ObjectId;
  logAnswers: boolean;
  logActivityUserInteractions: boolean;
  logActivityFeedbackViews: boolean;
  additionalActivities: Types.ObjectId[];
  reviewOptions?: Map<string, any>; // added in 5.0.0
  patron?: string; // added in 5.0.0
  userSelfPredictedPerformance?: number; // added in 6.0.0
  userEstimatedRetrievability?: number; // added in 6.0.0
  createdAt?: Date;
  updatedAt?: Date;
}

export type PlayContextDocument = HydratedDocument<PlayContext>;

const playContextSchema = new Schema(
  {
    contextId: {
      type: String,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // "Unlock" introduced with BEACON Q 2.3.0: used when the user missed playing a scheduled quiz and instead unlocks the activities later
    playType: {
      type: String,
      enum: [
        "trialQuiz",
        "scheduledQuiz",
        "review",
        "challengeReview",
        "test",
        "unlock",
      ],
      required: true,
    },
    descriptor: {
      type: String,
      required: false,
    },
    // The activities part of the play context, but not necessarily all were played by the user.
    activities: [
      {
        type: Schema.Types.ObjectId,
        ref: "Activity",
        required: true,
      },
    ],
    topics: [
      {
        type: Schema.Types.ObjectId,
        ref: "Topic",
        required: false,
      },
    ],
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    courseSessions: [
      {
        type: Schema.Types.ObjectId,
        required: false,
      },
    ],
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    //
    logAnswers: {
      type: Boolean,
      required: true,
      default: true,
    },
    logActivityUserInteractions: {
      type: Boolean,
      required: true,
      default: true,
    },
    logActivityFeedbackViews: {
      type: Boolean,
      required: true,
      default: true,
    },
    /// The activities added during play, e.g., activities which were repeated after an initial wrong answer
    additionalActivities: [
      {
        type: Schema.Types.ObjectId,
        ref: "Activity",
        required: true,
      },
    ],
    // Introduced with BEACON Q 5.0.0
    reviewOptions: {
      type: Map,
      required: false,
    },
    // Introduced with BEACON Q 5.0.0
    patron: {
      type: String,
      required: false,
    },
    // Introduced with BEACON Q 6.0.0
    userSelfPredictedPerformance: {
      type: Number,
      required: false,
    },
    // Introduced with BEACON Q 6.0.0
    userEstimatedRetrievability: {
      type: Number,
      required: false,
    },
  },
  { collection: "play_contexts", timestamps: true },
);
playContextSchema.index({ contextId: 1 }, { unique: true });
playContextSchema.index({ course: 1 }, { unique: false });
playContextSchema.index(
  { contextId: 1, course: 1, playType: 1 },
  { unique: false },
);
playContextSchema.index({ user: 1, course: 1, playType: 1 }, { unique: false });

export const PlayContextModel: Model<PlayContextDocument> =
  mongoose.model<PlayContextDocument>("PlayContext", playContextSchema);
