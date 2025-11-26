import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';

export interface UserPatronProfile {
  user: Types.ObjectId;
  course?: Types.ObjectId;
  patronStandings: Map<string, number>;
  activePatron: string;
  activePatronLastChanged?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserPatronProfileDocument = HydratedDocument<UserPatronProfile>;

const userPatronProfileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: false,
    },
    patronStandings: {
      type: Map,
      required: true,
      of: Number,
      // Use a factory so each document gets its own Map instance
      default: () => new Map<string, number>(),
    },
    activePatron: {
      type: String,
      required: true,
    },
    activePatronLastChanged: {
      type: Date,
      required: false,
    },
  },
  {
    collection: 'user_patron_profiles',
    timestamps: true,
    toJSON: { virtuals: true },
  }
);
userPatronProfileSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true,
});
userPatronProfileSchema.index({ user: 1, course: 1 }, { unique: true });

export const UserPatronProfileModel: Model<UserPatronProfileDocument> =
  mongoose.model<UserPatronProfileDocument>(
    'UserPatronProfile',
    userPatronProfileSchema
  );
