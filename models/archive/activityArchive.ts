import mongoose, { HydratedDocument, Schema, Model } from 'mongoose';
import { Activity, activitySchema, ActivityDocument } from '../activity';

export interface ActivityArchive {
  activity: Activity | ActivityDocument;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityArchiveDocument = HydratedDocument<ActivityArchive>;

const activityArchiveSchema = new Schema(
  {
    activity: {
      type: activitySchema,
      required: true,
    },
  },
  {
    collection: 'activities_archive',
    discriminatorKey: 'kind',
    timestamps: true,
  }
);
activityArchiveSchema.index(
  { 'activity._id': 1, 'activity.version': 1 },
  { unique: true }
);

export const ActivityArchiveModel: Model<ActivityArchiveDocument> =
  mongoose.model<ActivityArchiveDocument>(
    'ActivityArchive',
    activityArchiveSchema
  );
