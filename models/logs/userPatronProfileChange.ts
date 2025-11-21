import mongoose, { HydratedDocument, Schema, Model } from "mongoose";

export interface UserPatronProfileChange {
  user: mongoose.Types.ObjectId;
  course?: mongoose.Types.ObjectId;
  oldPatron?: string;
  newPatron: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserPatronProfileChangeDocument =
  HydratedDocument<UserPatronProfileChange>;

const userPatronProfileChangeSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    oldPatron: {
      type: String,
      required: false,
    },
    newPatron: {
      type: String,
      required: true,
    },
  },
  { collection: "user_patron_profile_changes", timestamps: true },
);

export const UserPatronProfileChangeModel: Model<UserPatronProfileChangeDocument> =
  mongoose.model<UserPatronProfileChangeDocument>(
    "UserPatronProfileChange",
    userPatronProfileChangeSchema,
  );
