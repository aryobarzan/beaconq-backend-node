var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var ebisuSchema = new Schema(
  {
    time: {
      type: Number,
      required: true,
    },
    alpha: {
      type: Number,
      required: true,
    },
    beta: {
      type: Number,
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
    lastUpdatedDate: {
      type: Date,
      default: () => new Date(),
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
  { collection: "ebisu_models", timestamps: true }
);
// TODO: custom index?

module.exports = mongoose.model("EbisuModel", ebisuSchema);
