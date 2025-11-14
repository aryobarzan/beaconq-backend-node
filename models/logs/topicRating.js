var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var topicRatingSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    topic: {
      type: Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    rating: {
      type: Number,
      default: 3.0,
      min: 1.0,
      max: 5.0,
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    courseSession: {
      type: Schema.Types.ObjectId,
      required: false,
    },
  },
  { collection: "topic_ratings", timestamps: true }
);
/// No custom schema as multiple ratings for the same topic by the same user are allowed, except when it is session-specific.
var topicRatingSchemaModel = mongoose.model("TopicRating", topicRatingSchema);

module.exports = topicRatingSchemaModel;
