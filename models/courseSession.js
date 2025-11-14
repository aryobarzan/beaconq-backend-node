var mongoose = require("mongoose");
var scheduledQuiz = require("./scheduledQuiz");
var Schema = mongoose.Schema;
const beaconResource = require("./beaconResource");

var courseSessionSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  topics: [
    {
      type: Schema.Types.ObjectId,
      ref: "Topic",
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
  scheduledQuizzes: [scheduledQuiz.schema],
  /// Introduced in BEACON Q 5.1.0
  beaconResources: [beaconResource.schema],
});

module.exports = {
  schema: courseSessionSchema,
  model: mongoose.model("CourseSession", courseSessionSchema),
};
