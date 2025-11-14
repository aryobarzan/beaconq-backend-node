var mongoose = require("mongoose");
var Schema = mongoose.Schema;
/// DEPRECATED - replaced by TopicRating
var sessionTopicRatingSchema = new Schema(
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
    courseSession: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    rating: {
      type: Number,
      default: 3.0,
      required: true,
    },
  },
  { collection: "session_topic_ratings", timestamps: true }
);
sessionTopicRatingSchema.index(
  { topic: 1, courseSession: 1, user: 1 },
  { unique: true }
);
var sessionTopicRatingSchemaModel = mongoose.model(
  "SessionTopicRating",
  sessionTopicRatingSchema
);

module.exports = sessionTopicRatingSchemaModel;
