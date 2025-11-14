var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var courseRegistrationSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    registrationDates: [
      {
        type: Date,
        default: () => new Date(),
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { collection: "course_registrations" },
);
courseRegistrationSchema.index({ course: 1, user: 1 }, { unique: true });
courseRegistrationSchema.index(
  { course: 1, user: 1, isActive: 1 },
  { unique: false },
);

module.exports = mongoose.model("CourseRegistration", courseRegistrationSchema);
