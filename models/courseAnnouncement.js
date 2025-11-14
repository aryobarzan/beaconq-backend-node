var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var courseAnnouncementSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    dateTime: {
      type: Date,
      required: false,
    },
    courseSessions: [
      {
        type: Schema.Types.ObjectId,
        ref: "CourseSession",
        required: false,
      },
    ],
    topics: [
      {
        type: Schema.Types.ObjectId,
        ref: "Topic",
        required: false,
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
  },
  {
    collection: "course_announcements",
    timestamps: true,
  },
);
courseAnnouncementSchema.index({ course: 1, dateTime: 1 }, { unique: false });
var courseAnnouncementModel = mongoose.model(
  "CourseAnnouncement",
  courseAnnouncementSchema,
);

module.exports = courseAnnouncementModel;
