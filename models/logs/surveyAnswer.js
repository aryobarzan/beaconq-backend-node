var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var surveyAnswerSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scheduledQuiz: {
      type: Schema.Types.ObjectId,
      ref: "ScheduledQuiz",
      required: true,
    },
    serverTimestamp: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
    answers: [
      {
        question: {
          type: String,
          required: true,
        },
        questionType: {
          type: String,
          required: true,
        },
        answer: {
          type: String,
          required: true,
        },
        min: {
          type: Number,
          required: false,
        },
        max: {
          type: Number,
          required: false,
        },
        isMultipleChoice: {
          type: Boolean,
          required: false,
        },
        choices: [{ type: String, required: false }],
      },
    ],
  },
  { collection: "survey_answers", timestamps: true }
);
surveyAnswerSchema.index({ scheduledQuiz: 1, user: 1 }, { unique: true });
var surveyAnswerSchemaModel = mongoose.model(
  "SurveyAnswer",
  surveyAnswerSchema
);

module.exports = surveyAnswerSchemaModel;
