var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var appFeedbackSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    isAnonymous: {
      type: Boolean,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    appFeedbackType: {
      type: String,
      required: true,
    },
    includeLogFile: {
      type: Boolean,
      required: true,
    },
    devicePlatform: {
      type: String,
      required: true,
    },
    appVersion: {
      type: String,
      required: true,
    },
    appBuildNumber: {
      type: String,
      required: true,
    },
  },
  { collection: "app_feedback", timestamps: true },
);
var appFeedbackSchemaModel = mongoose.model("AppFeedback", appFeedbackSchema);

module.exports = appFeedbackSchemaModel;
