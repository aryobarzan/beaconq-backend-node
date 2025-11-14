var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var activitySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    // activityType: {
    //     type: String,
    //     required: true
    // },
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
        message: "{VALUE} is not an integer value",
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
        ref: "images.files",
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
    topics: [{ type: Schema.Types.ObjectId, ref: "Topic" }],
    externalVideoLinks: [{ type: String, required: false }],
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
  { collection: "activities", discriminatorKey: "kind", timestamps: true },
);
// Improve populate() operation performance
activitySchema.index({ topics: 1 }, { unique: false });
var activityModel = mongoose.model("Activity", activitySchema);

// Choice Activity (& Recall)
var choiceActivitySchema = new Schema(
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
      default: "recognitionRecall",
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
  { collection: "activities", discriminatorKey: "kind", timestamps: true },
);
var choiceActivityDiscriminator = activityModel.discriminator(
  "ChoiceActivity",
  choiceActivitySchema,
);

// DartBlock Activity
var dartBlockActivitySchema = new Schema(
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
  { collection: "activities", discriminatorKey: "kind", timestamps: true },
);
var dartBlockActivityDiscriminator = activityModel.discriminator(
  "DartBlockActivity",
  dartBlockActivitySchema,
);

module.exports.BaseActivitySchema = activitySchema;
module.exports.BaseActivity = activityModel;
module.exports.ChoiceActivity = choiceActivityDiscriminator;
module.exports.DartBlockActivity = dartBlockActivityDiscriminator;
