import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";

// Activity computed difficulty data

export interface ActivityComputedDifficultyData {
  activityHardness: number;
  activityHardnessWeight: number;
  activityDifficulty: number;
  activityRecallProbability: number;
  relatedActivitiesCount: number;
  relatedActivitiesAverageRecallProbability: number;
  relatedActivitiesAverageDifficulty: number;
  courseMastery?: number; // deprecated in 5.0.0
  difficultyAlgorithmVersionCode: number;
  activityComponentWeight: number;
  relatedActivitiesComponentWeight: number;
  coreComponentWeight: number;
  computedDifficulty: number;
}

export type ActivityComputedDifficultyDataDocument =
  HydratedDocument<ActivityComputedDifficultyData>;

const activityComputedDifficultyDataSchema = new Schema({
  activityHardness: Number,
  activityHardnessWeight: Number,
  activityDifficulty: Number,
  activityRecallProbability: Number,
  relatedActivitiesCount: Number,
  relatedActivitiesAverageRecallProbability: Number,
  relatedActivitiesAverageDifficulty: Number,
  // As of BEACON Q 5.0.0, no longer used.
  courseMastery: { type: Number, required: false },
  difficultyAlgorithmVersionCode: Number,
  activityComponentWeight: Number,
  relatedActivitiesComponentWeight: Number,
  coreComponentWeight: Number,
  computedDifficulty: Number,
});

// Activity user answer

export interface ActivityUserAnswer {
  user: Types.ObjectId;
  playContextId?: string;
  scheduledQuiz?: Types.ObjectId;
  courseContext?: Types.ObjectId; // added in 4.0.0
  activity: Types.ObjectId;
  activityVersion: number;
  /// "Hardness"
  activityDifficulty: number;
  /// Can be one of following:
  /// (1) Fixed difficulty
  /// (2) Computed difficulty (client-side). In this case, difficulty == computedDifficultyData.computedDifficulty
  /// (3) Default difficulty: 0.5
  difficulty: number;
  /// The individual parameters constituting the difficulty computation process.
  /// This field is null for 'difficulty' cases (1) and (3).
  computedDifficultyData?: ActivityComputedDifficultyData; // added in 2.3.0.
  activityAnswerType: string;
  activityPlayTime: number;
  isCorrect: boolean;
  difficultyModifier?: Map<string, any>;
  patron?: string; // added in 5.0.0
  timestamp: Date;
  serverTimestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityUserAnswerDocument = HydratedDocument<ActivityUserAnswer>;

const activityUserAnswerSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    playContextId: {
      type: String,
      required: false,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: "ScheduledQuiz",
      required: false,
    },
    courseContext: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    activity: {
      type: Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
    },
    activityVersion: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    /// "Hardness"
    activityDifficulty: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 10,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    /// Can be one of following:
    /// (1) Fixed difficulty
    /// (2) Computed difficulty (client-side). In this case, difficulty == computedDifficultyData.computedDifficulty
    /// (3) Default difficulty: 0.5
    difficulty: {
      type: Number,
      default: 0.5,
      // min: 0.0,
      // max: 1.0,
      required: true,
    },
    /// The individual parameters constituting the difficulty computation process.
    /// This field is null for 'difficulty' cases (1) and (3).
    /// Introduced with BEACON Q 2.3.0.
    computedDifficultyData: {
      type: activityComputedDifficultyDataSchema,
      required: false,
    },
    activityAnswerType: {
      type: String,
      required: true,
    },
    activityPlayTime: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    isCorrect: {
      type: Boolean,
      required: true,
    },
    difficultyModifier: {
      type: Map,
      required: false,
    },
    patron: {
      type: String,
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
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
activityUserAnswerSchema.index(
  { timestamp: 1, activity: 1, user: 1 },
  { unique: true },
);
activityUserAnswerSchema.index(
  { scheduledQuiz: 1, activity: 1, user: 1 },
  {
    unique: true,
    partialFilterExpression: { scheduledQuiz: { $exists: true } },
  },
);
activityUserAnswerSchema.index({ user: 1 }, { unique: false });
activityUserAnswerSchema.index({ timestamp: 1 }, { unique: false });
activityUserAnswerSchema.index({ courseContext: 1 }, { unique: false });
activityUserAnswerSchema.index(
  { scheduledQuiz: 1, user: 1 },
  {
    unique: false,
    // Only index the documents whose scheduledQuiz field is not null
    partialFilterExpression: { scheduledQuiz: { $exists: true } },
  },
);
activityUserAnswerSchema.index(
  { playContextId: 1, user: 1 },
  { unique: false },
);

export const ActivityUserAnswerModel: Model<ActivityUserAnswerDocument> =
  mongoose.model<ActivityUserAnswerDocument>(
    "ActivityUserAnswer",
    activityUserAnswerSchema,
  );

// Choice Activity User Answer

export interface ChoiceActivityUserAnswer extends ActivityUserAnswer {
  answers: { answer: string; evaluation: string }[];
  answerOrder: string[];
  isCorrectOrder: boolean;
}

export type ChoiceActivityUserAnswerDocument =
  HydratedDocument<ChoiceActivityUserAnswer>;

const choiceActivityUserAnswerSchema = new Schema(
  {
    answers: [
      {
        answer: {
          type: String,
          required: true,
        },
        evaluation: {
          type: String,
          required: true,
        },
      },
    ],
    answerOrder: [
      {
        type: String,
      },
    ],
    isCorrectOrder: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  {
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
export const ChoiceActivityUserAnswerModel: Model<ChoiceActivityUserAnswerDocument> =
  ActivityUserAnswerModel.discriminator<ChoiceActivityUserAnswerDocument>(
    "ChoiceActivityUserAnswer",
    choiceActivityUserAnswerSchema,
  );

// Recall Activity User Answer

export interface RecallActivityUserAnswer extends ActivityUserAnswer {
  answers: { answer: string; evaluation: string }[];
  answerOrder: string[];
  isCorrectOrder: boolean;
  levenshteinThreshold?: number;
}

export type RecallActivityUserAnswerDocument =
  HydratedDocument<RecallActivityUserAnswer>;

const recallActivityUserAnswerSchema = new Schema(
  {
    answers: [
      {
        answer: {
          type: String,
          required: true,
        },
        evaluation: {
          type: String,
          required: true,
        },
      },
    ],
    answerOrder: [
      {
        type: String,
      },
    ],
    isCorrectOrder: {
      type: Boolean,
      required: true,
      default: true,
    },
    levenshteinThreshold: {
      type: Number,
      required: false,
      min: 0.0,
      max: 1.0,
    },
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  {
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);

export const RecallActivityUserAnswerModel: Model<RecallActivityUserAnswerDocument> =
  ActivityUserAnswerModel.discriminator<RecallActivityUserAnswerDocument>(
    "RecallActivityUserAnswer",
    recallActivityUserAnswerSchema,
  );

// DartBlock activity user answer

export interface DartBlockActivityUserAnswer extends ActivityUserAnswer {
  userSolution: Map<string, any>;
  evaluationResult: Map<string, any>;
  dartBlockInteractions?: Map<string, any>[]; // added in 5.1.1
}

export type DartBlockActivityUserAnswerDocument =
  HydratedDocument<DartBlockActivityUserAnswer>;

const dartBlockActivityUserAnswerSchema = new Schema(
  {
    userSolution: {
      type: Map,
      required: true,
    },
    evaluationResult: {
      type: Map,
      required: true,
    },
    dartBlockInteractions: [
      {
        type: Map,
        required: false,
      },
    ],
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  {
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);

export const DartBlockActivityUserAnswerModel: Model<DartBlockActivityUserAnswerDocument> =
  ActivityUserAnswerModel.discriminator<DartBlockActivityUserAnswerDocument>(
    "DartBlockActivityUserAnswer",
    dartBlockActivityUserAnswerSchema,
  );
