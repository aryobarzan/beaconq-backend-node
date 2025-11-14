var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var activityFeedbackViewSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    playContextId: {
      type: String,
      required: false,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: "ScheduledQuiz",
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
    collection: "activity_feedback_view",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
activityFeedbackViewSchema.index(
  {
    user: 1,
    activity: 1,
    timestamp: 1,
  },
  { unique: true },
);
var activityFeedbackViewModel = mongoose.model(
  "ActivityFeedbackView",
  activityFeedbackViewSchema,
);

var choiceActivityFeedbackViewSchema = new Schema(
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
  {
    collection: "activity_feedback_view",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
choiceActivityFeedbackViewSchema.index(
  {
    user: 1,
    activity: 1,
    timestamp: 1,
  },
  { unique: true },
);
var choiceActivityFeedbackViewDiscriminator =
  activityFeedbackViewModel.discriminator(
    "ChoiceActivityFeedbackView",
    choiceActivityFeedbackViewSchema,
  );

var dartBlockActivityFeedbackViewSchema = new Schema(
  {
    feedbackViewType: {
      type: String,
      required: true,
    },
  },
  {
    collection: "activity_feedback_view",
    discriminatorKey: "kind",
    timestamps: true,
  },
);
dartBlockActivityFeedbackViewSchema.index(
  {
    user: 1,
    activity: 1,
    timestamp: 1,
  },
  { unique: true },
);
var dartBlockActivityFeedbackViewDiscriminator =
  activityFeedbackViewModel.discriminator(
    "DartBlockActivityFeedbackView",
    dartBlockActivityFeedbackViewSchema,
  );

module.exports.base = activityFeedbackViewModel;
module.exports.ChoiceActivityFeedbackView =
  choiceActivityFeedbackViewDiscriminator;
module.exports.DartBlockActivityFeedbackView =
  dartBlockActivityFeedbackViewDiscriminator;
