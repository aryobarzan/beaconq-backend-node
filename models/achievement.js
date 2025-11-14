var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var achievementSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    points: {
      type: Number,
      required: true,
      min: 25,
      max: 150,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    hideDescription: {
      type: Boolean,
      default: false,
      required: true,
    },
    criteria: {
      type: Map,
      required: true,
      of: Number,
    },
    author: {
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
  { collection: "achievements", timestamps: true },
);
var achievementModel = mongoose.model("Achievement", achievementSchema);

module.exports = achievementModel;
