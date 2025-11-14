var mongoose = require("mongoose");
var Schema = mongoose.Schema;
// Deprecated as of 4.0.0, replaced by AppUserInteractionLog
var appInteractionLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    logType: {
      type: String,
      enum: [
        "openIntegrationDartBlockPad",
        "openLighthouse",
        "openCourseBeaconResources",
        "openCourseAchievements",
        "viewTopicResources",
        "openCourseLeaderboard",
        "openPatronSelectionPage",
        "openCoursePatronLeaderboard",
      ],
      required: true,
    },
    content: {
      type: String,
      default: "N/A",
      required: false,
    },
    interactionTimestamp: {
      type: Date,
      required: true,
    },
  },
  {
    collection: "app_interactions",
    timestamps: true,
  },
);
appInteractionLogSchema.index(
  {
    user: 1,
    interactionTimestamp: 1,
    logType: 1,
    content: 1,
  },
  { unique: true },
);

var appInteractionLogModel = mongoose.model(
  "AppInteractionLog",
  appInteractionLogSchema,
);
module.exports = appInteractionLogModel;
