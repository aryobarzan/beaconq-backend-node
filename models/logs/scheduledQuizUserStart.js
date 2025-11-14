var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var scheduledQuizUserStartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: "ScheduledQuiz",
      required: true,
    },
    // Deprecated - this is now computed client-side and stored in each ActivityUserAnswer
    // activityDifficulties: {
    //   type: Map,
    //   of: new Schema({
    //     difficulty: Number,
    //     explanation: String,
    //   }),
    //   required: false,
    // },
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
    collection: "scheduled_quiz_user_start",
    discriminatorKey: "kind",
    timestamps: true,
  }
);
scheduledQuizUserStartSchema.index(
  { scheduledQuiz: 1, user: 1 },
  { unique: true }
);
var scheduledQuizUserStartSchemaModel = mongoose.model(
  "ScheduledQuizUserStart",
  scheduledQuizUserStartSchema
);

module.exports = scheduledQuizUserStartSchemaModel;
