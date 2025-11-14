var mongoose = require("mongoose");
var Schema = mongoose.Schema;
// New as of 4.0.0, replaces old AppInteractionLog
var appUserInteractionLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientTimestamp: {
      type: Date,
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    interactionType: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: "N/A",
      required: false,
    },
  },
  {
    collection: "app_user_interactions",
  },
);

var appUserInteractionLogModel = mongoose.model(
  "AppUserInteractionLog",
  appUserInteractionLogSchema,
);
module.exports = appUserInteractionLogModel;
