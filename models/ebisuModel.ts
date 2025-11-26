import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';
// DEPRECATED: replaced by fsrsModel.ts
export interface Ebisu {
  time: number;
  alpha: number;
  beta: number;
  dataType: 'activity' | 'topic';
  dataId: string;
  user: Types.ObjectId;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EbisuDocument = HydratedDocument<Ebisu>;

const ebisuSchema = new Schema(
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
      enum: ['activity', 'topic'],
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
      ref: 'User',
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value',
      },
    },
  },
  { collection: 'ebisu_models', timestamps: true }
);

export const EbisuModel: Model<EbisuDocument> = mongoose.model<EbisuDocument>(
  'EbisuModel',
  ebisuSchema
);
