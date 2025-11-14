var mongoose = require("mongoose");
var activity = require("../activity");
var Schema = mongoose.Schema;
var activityArchiveSchema = new Schema(
  {
    activity: {
      type: activity.BaseActivitySchema,
      required: true,
    },
  },
  {
    collection: "activities_archive",
    discriminatorKey: "kind",
    timestamps: true,
  }
);
activityArchiveSchema.index(
  { "activity._id": 1, "activity.version": 1 },
  { unique: true }
);
var activityArchiveModel = mongoose.model(
  "ActivityArchive",
  activityArchiveSchema
);
module.exports = activityArchiveModel;
