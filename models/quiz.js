var mongoose = require("mongoose");
var Schema = mongoose.Schema;
const beaconResource = require("./beaconResource");

var quizSchema = new Schema(
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
    // Added in 3.1.0 of BEACON Q
    useCustomSurveyQuestions: {
      type: Boolean,
      default: false,
    },
    // Added in 3.1.0 of BEACON Q
    excludeDefaultSurveyQuestions: {
      type: Boolean,
      default: false,
    },
    // Added in 3.1.0 of BEACON Q
    surveyQuestions: [{ type: Map, required: false }],
    // Added in 3.2.1 of BEACON Q (Deprecated in 3.4.0 and replaced with 'postFeedbackBeaconResource')
    postFeedback: {
      type: String,
      required: false,
    },
    // Added in 3.4.0 of BEACON Q
    postFeedbackBeaconResource: {
      type: beaconResource.schema,
      required: false,
    },
    /// Deprecated, now use Mongoose's own timestamps createdAt & updatedAt
    // creationDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
    // updateDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
  },
  { collection: "quizzes", timestamps: true },
);

module.exports = mongoose.model("Quiz", quizSchema);
