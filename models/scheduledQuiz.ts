import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';

export interface ScheduledQuiz {
  _id: Types.ObjectId;
  quiz: Types.ObjectId;
  startDateTime: Date;
  endDateTime: Date;
  playDuration: number;
  assessmentType: string;
  fixedDifficulty?: number; // added in 2.3.0
}

export type ScheduledQuizDocument = HydratedDocument<ScheduledQuiz>;

const scheduledQuizSchema = new Schema({
  quiz: {
    type: Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true,
  },
  startDateTime: {
    type: Date,
    required: true,
  },
  endDateTime: {
    type: Date,
    required: true,
  },
  playDuration: {
    type: Number,
    required: true,
  },
  assessmentType: {
    type: String,
    required: true,
  },
  fixedDifficulty: {
    type: Number,
    min: 0.0,
    max: 1.0,
    required: false,
  },
});

export const ScheduledQuizModel: Model<ScheduledQuizDocument> =
  mongoose.model<ScheduledQuizDocument>('ScheduledQuiz', scheduledQuizSchema);

export { scheduledQuizSchema as schema, ScheduledQuizModel as model };
