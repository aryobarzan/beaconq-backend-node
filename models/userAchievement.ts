import mongoose, { Schema, HydratedDocument, Model, Types } from "mongoose";

export interface UserAchievement {
  achievement: Types.ObjectId;
  user: Types.ObjectId;
  criteriaProgress: Map<string, number>;
  unlockedAt?: Date;
  requiresUpload?: boolean;
}

export type UserAchievementDocument = HydratedDocument<UserAchievement>;

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

const UserAchievementModel: Model<UserAchievementDocument> =
  mongoose.model<UserAchievementDocument>(
    "UserAchievement",
    userAchievementSchema,
  );

export { userAchievementSchema as schema, UserAchievementModel as model };
