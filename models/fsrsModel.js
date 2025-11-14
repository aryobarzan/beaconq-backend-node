var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var fsrsCardSchema = new Schema({
  due: {
    type: Date,
    required: true,
  },
  stability: {
    type: Number,
    required: true,
  },
  difficulty: {
    type: Number,
    required: true,
  },
  elapsedDays: {
    type: Number,
    required: true,
  },
  scheduledDays: {
    type: Number,
    required: true,
  },
  repetitions: {
    type: Number,
    required: true,
  },
  lapses: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  lastReview: {
    type: Date,
    required: false,
  },
});
var fsrsReviewLogSchema = new Schema({
  rating: {
    type: String,
    required: true,
  },
  elapsedDays: {
    type: Number,
    required: true,
  },
  scheduledDays: {
    type: Number,
    required: true,
  },
  review: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
});

var fsrsSchema = new Schema(
  {
    card: {
      type: fsrsCardSchema,
      required: true,
    },
    reviewLog: {
      type: fsrsReviewLogSchema,
      required: true,
    },
    dataType: {
      type: String,
      enum: ["activity", "topic"],
      required: true,
    },
    dataId: {
      type: String,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
  },
  { collection: "fsrs_models", timestamps: true },
);
fsrsSchema.index({ user: 1, dataId: 1, dataType: 1 }, { unique: true });

module.exports = mongoose.model("FSRSModel", fsrsSchema);
