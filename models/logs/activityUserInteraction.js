var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var activityUserInteractionSchema = new Schema(
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
    playContextId: {
      type: String,
      required: false,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: "ScheduledQuiz",
      required: false,
    },
    type: {
      type: String,
      enum: ["viewedHints", "viewedPointers"],
      required: true,
    },
    content: {
      type: String,
      default: "N/A",
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
    collection: "activity_user_interactions",
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

var activityUserInteractionModel = mongoose.model(
  "ActivityUserInteraction",
  activityUserInteractionSchema
);
module.exports = activityUserInteractionModel;
