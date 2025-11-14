var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var scheduledQuizSchema = new Schema({
  quiz: {
    type: Schema.Types.ObjectId,
    ref: "Quiz",
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
  /// Introduced with BEACON Q 2.3.0
  fixedDifficulty: {
    type: Number,
    min: 0.0,
    max: 1.0,
    required: false,
  },
});

// Schema only, not a model - It is solely used as a subchild of the Course model (outdated?)
module.exports = {
  schema: scheduledQuizSchema,
  model: mongoose.model("ScheduledQuiz", scheduledQuizSchema),
};
