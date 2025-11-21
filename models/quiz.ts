import mongoose, { HydratedDocument, Schema, Model, Types } from "mongoose";
import {
  schema as beaconResourceSchema,
  BeaconResource,
} from "./beaconResource";

export interface Quiz {
  title: string;
  activities: Types.ObjectId[];
  version: number;
  useCustomSurveyQuestions: boolean; // added in 3.1.0
  excludeDefaultSurveyQuestions: boolean; // added in 3.1.0
  surveyQuestions?: Record<string, any>[]; // added in 3.1.0
  postFeedback?: string; // added in 3.2.1, deprecated in 3.4.0
  postFeedbackBeaconResource?: BeaconResource; // added in 3.4.0
  createdAt?: Date;
  updatedAt?: Date;
}

export type QuizDocument = HydratedDocument<Quiz>;

const quizSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    activities: [
      {
        type: Schema.Types.ObjectId,
        ref: "Activity",
      },
    ],
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    useCustomSurveyQuestions: {
      type: Boolean,
      default: false,
    },
    excludeDefaultSurveyQuestions: {
      type: Boolean,
      default: false,
    },
    surveyQuestions: [{ type: Map, required: false }],
    postFeedback: {
      type: String,
      required: false,
    },
    postFeedbackBeaconResource: {
      type: beaconResourceSchema,
      required: false,
    },
  },
  { collection: "quizzes", timestamps: true },
);

export const QuizModel: Model<QuizDocument> = mongoose.model<QuizDocument>(
  "Quiz",
  quizSchema,
);
