var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var coursePatronProfileSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    patron: {
      type: String,
      required: true,
    },
    contributionCount: {
      type: Number,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
  },
  { collection: "course_patron_profiles", timestamps: true },
);
coursePatronProfileSchema.index({ patron: 1, course: 1 }, { unique: true });
var coursePatronProfileModel = mongoose.model(
  "CoursePatronProfile",
  coursePatronProfileSchema,
);

module.exports = coursePatronProfileModel;
