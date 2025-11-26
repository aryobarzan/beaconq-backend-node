import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';
import { schema as scheduledQuizSchema, ScheduledQuiz } from './scheduledQuiz';
import {
  schema as beaconResourceSchema,
  BeaconResource,
} from './beaconResource';

export interface CourseSession {
  _id: Types.ObjectId;
  title: string;
  topics: Types.ObjectId[];
  currentTopicIndex: number;
  startDateTime: Date;
  endDateTime: Date;
  scheduledQuizzes: ScheduledQuiz[];
  beaconResources?: BeaconResource[]; // added in 5.1.0
}

export type CourseSessionDocument = HydratedDocument<CourseSession>;

const courseSessionSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  topics: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Topic',
    },
  ],
  currentTopicIndex: {
    type: Number,
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
  scheduledQuizzes: [scheduledQuizSchema],
  beaconResources: [beaconResourceSchema],
});

export const CourseSessionModel: Model<CourseSessionDocument> =
  mongoose.model<CourseSessionDocument>('CourseSession', courseSessionSchema);

export { courseSessionSchema as schema, CourseSessionModel as model };
