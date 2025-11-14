var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var userAchievementSchema = new Schema(
  {
    achievement: {
      type: Schema.Types.ObjectId,
      ref: "Achievement",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    criteriaProgress: {
      type: Map,
      required: true,
      of: Number,
    },
    unlockedAt: {
      type: Date,
      required: false,
    },
    requiresUpload: {
      type: Boolean,
      required: false,
    },
  },
  { collection: "user_achievements", timestamps: true },
);
userAchievementSchema.index({ achievement: 1, user: 1 }, { unique: true });
var userAchievementModel = mongoose.model(
  "UserAchievement",
  userAchievementSchema,
);

module.exports = userAchievementModel;
