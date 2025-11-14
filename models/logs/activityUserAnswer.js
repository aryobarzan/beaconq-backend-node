var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var activityComputedDifficultyDataSchema = new Schema({
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

var activityUserAnswerSchema = new Schema(
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
    /// Introduced with BEACON Q 4.0.0
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
    // Introduced with BEACON Q 5.0.0
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
var activityUserAnswerModel = mongoose.model(
  "ActivityUserAnswer",
  activityUserAnswerSchema,
);

var choiceActivityUserAnswerSchema = new Schema(
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
  {
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
var choiceActivityUserAnswerDiscriminator =
  activityUserAnswerModel.discriminator(
    "ChoiceActivityUserAnswer",
    choiceActivityUserAnswerSchema,
  );

var recallActivityUserAnswerSchema = new Schema(
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
  {
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);

var recallActivityUserAnswerDiscriminator =
  activityUserAnswerModel.discriminator(
    "RecallActivityUserAnswer",
    recallActivityUserAnswerSchema,
  );

var dartBlockActivityUserAnswerSchema = new Schema(
  {
    userSolution: {
      type: Map,
      required: true,
    },
    evaluationResult: {
      type: Map,
      required: true,
    },
    /// Introduced with BEACON Q 5.1.1
    dartBlockInteractions: [
      {
        type: Map,
        required: false,
      },
    ],
  },
  {
    collection: "activity_user_answers",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
dartBlockActivityUserAnswerSchema.index(
  { timestamp: 1, activity: 1, user: 1 },
  { unique: true },
);
dartBlockActivityUserAnswerSchema.index(
  { courseContext: 1 },
  { unique: false },
);
dartBlockActivityUserAnswerSchema.index(
  { scheduledQuiz: 1, user: 1 },
  { unique: false },
);
dartBlockActivityUserAnswerSchema.index(
  { playContextId: 1, user: 1 },
  { unique: false },
);
var dartBlockActivityUserAnswerDiscriminator =
  activityUserAnswerModel.discriminator(
    "DartBlockActivityUserAnswer",
    dartBlockActivityUserAnswerSchema,
  );

module.exports.base = activityUserAnswerModel;
module.exports.ChoiceActivityUserAnswer = choiceActivityUserAnswerDiscriminator;
module.exports.RecallActivityUserAnswer = recallActivityUserAnswerDiscriminator;
module.exports.DartBlockActivityUserAnswer =
  dartBlockActivityUserAnswerDiscriminator;
