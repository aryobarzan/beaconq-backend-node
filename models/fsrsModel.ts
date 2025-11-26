import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';

// FSRS card

export interface FSRSCard {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  repetitions: number;
  lapses: number;
  status: string;
  lastReview?: Date;
}

export type FSRSCardDocument = HydratedDocument<FSRSCard>;

const fsrsCardSchema = new Schema({
  due: {
    type: Date,
    required: true,
  },
  stability: {
    type: Number,
    required: true,
  },
  difficulty: {
    type: Number,
    required: true,
  },
  elapsedDays: {
    type: Number,
    required: true,
  },
  scheduledDays: {
    type: Number,
    required: true,
  },
  repetitions: {
    type: Number,
    required: true,
  },
  lapses: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  lastReview: {
    type: Date,
    required: false,
  },
});

// FSRS review log

export interface FSRSReviewLog {
  rating: string;
  elapsedDays: number;
  scheduledDays: number;
  review: Date;
  status: string;
}

export type FSRSReviewLogDocument = HydratedDocument<FSRSReviewLog>;

const fsrsReviewLogSchema = new Schema({
  rating: {
    type: String,
    required: true,
  },
  elapsedDays: {
    type: Number,
    required: true,
  },
  scheduledDays: {
    type: Number,
    required: true,
  },
  review: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
});

// FSRS

export interface FSRS {
  card: FSRSCard;
  reviewLog: FSRSReviewLog;
  dataType: 'activity' | 'topic';
  dataId: string;
  user: Types.ObjectId;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FSRSDocument = HydratedDocument<FSRS>;

const fsrsSchema = new Schema(
  {
    card: {
      type: fsrsCardSchema,
      required: true,
    },
    reviewLog: {
      type: fsrsReviewLogSchema,
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
        message: (v: any) => `${v} is not an integer value`,
      },
    },
  },
  { collection: 'fsrs_models', timestamps: true }
);
fsrsSchema.index({ user: 1, dataId: 1, dataType: 1 }, { unique: true });

export const FSRSModel: Model<FSRSDocument> = mongoose.model<FSRSDocument>(
  'FSRSModel',
  fsrsSchema
);
