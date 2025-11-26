import mongoose, { HydratedDocument, Schema, Model, Types } from 'mongoose';

export interface CodeBlock {
  code: string;
  language: string;
  theme: string;
}

export interface Activity {
  title: string;
  // activityType: string;
  question: string;
  difficulty: number;
  taxonomy: string;
  time: number;
  images?: Types.ObjectId[];
  codeBlocks?: CodeBlock[];
  tags?: string[];
  topics?: Types.ObjectId[];
  externalVideoLinks?: string[];
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityDocument = HydratedDocument<Activity>;

// Base Activity

const activitySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    question: {
      type: String,
      required: true,
    },
    difficulty: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 10,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value',
      },
    },
    taxonomy: {
      type: String,
      required: true,
    },
    time: {
      type: Number,
      required: true,
    },
    images: [
      {
        type: Schema.Types.ObjectId,
        ref: 'images.files',
      },
    ],
    codeBlocks: [
      {
        code: {
          type: String,
          required: true,
        },
        language: {
          type: String,
          required: true,
        },
        theme: {
          type: String,
          required: true,
        },
      },
    ],
    tags: [{ type: String, required: false }],
    topics: [{ type: Schema.Types.ObjectId, ref: 'Topic' }],
    externalVideoLinks: [{ type: String, required: false }],
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
    /// Deprecated: now use Mongoose's own timestamps createdAt & updatedAt
    // creationDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
    // updateDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
  },
  { collection: 'activities', discriminatorKey: 'kind', timestamps: true }
);
// Improve populate() operation performance
activitySchema.index({ topics: 1 }, { unique: false });

export const ActivityModel: Model<ActivityDocument> =
  mongoose.model<ActivityDocument>('Activity', activitySchema);

// Choice (Recall) Activity

export interface ChoiceActivityAnswer {
  answer: string;
  alternatives?: string[];
  isCorrect: boolean;
  feedback?: string;
  hint?: string;
}

export interface ChoiceActivity extends Activity {
  answers: ChoiceActivityAnswer[];
  status: string;
  isOrdered: boolean;
  allowMisspellings: boolean;
  useSemanticSimilarity: boolean;
  generalRecallHint?: string;
}

export type ChoiceActivityDocument = HydratedDocument<ChoiceActivity>;

const choiceActivitySchema = new Schema(
  {
    answers: [
      {
        answer: {
          type: String,
          required: true,
        },
        alternatives: [
          {
            type: String,
          },
        ],
        isCorrect: {
          type: Boolean,
          required: true,
        },
        feedback: {
          type: String,
        },
        hint: {
          type: String,
        },
      },
    ],
    /// Prior to 2.0, possible values were: 'choiceOnly', 'choice', 'recall'
    /// As of 2.0: 'recognitionOnly', 'recognitionRecall', 'recallOnly'
    /// The server does not perform any validation, but the old database entries for activities created before 2.0 can still exhibit the old status values.
    /// The client app supports converting these old statuses to their new counterparts, hence the server does not need to perform any actions of its own.
    status: {
      type: String,
      default: 'recognitionRecall',
      required: true,
    },
    isOrdered: {
      type: Boolean,
      default: false,
      required: true,
    },
    allowMisspellings: {
      type: Boolean,
      required: true,
    },
    useSemanticSimilarity: {
      type: Boolean,
      required: true,
    },
    generalRecallHint: {
      type: String,
      required: false,
    },
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  { collection: 'activities', discriminatorKey: 'kind', timestamps: true }
);

export const ChoiceActivityModel: Model<ChoiceActivityDocument> =
  ActivityModel.discriminator<ChoiceActivityDocument>(
    'ChoiceActivity',
    choiceActivitySchema
  );

// DartBlock Activity

export interface DartBlockActivity extends Activity {
  solution: Map<string, any>;
  evaluator: Map<string, any>;
  disableNativeFunctions: boolean;
  feedback?: string;
}

export type DartBlockActivityDocument = HydratedDocument<DartBlockActivity>;

const dartBlockActivitySchema = new Schema(
  {
    solution: {
      type: Map,
      required: true,
    },
    evaluator: {
      type: Map,
      required: true,
    },
    disableNativeFunctions: {
      type: Boolean,
      required: true,
    },
    feedback: {
      type: String,
      required: false,
    },
  },
  // "collection" and "timestamps" not necessary as they are inherited from the base Activity schema, just retained for clarity
  { collection: 'activities', discriminatorKey: 'kind', timestamps: true }
);
export const DartBlockActivityModel: Model<DartBlockActivityDocument> =
  ActivityModel.discriminator<DartBlockActivityDocument>(
    'DartBlockActivity',
    dartBlockActivitySchema
  );

export default ActivityModel;
export { activitySchema };
