var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var userPatronProfileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: false,
    },
    patronStandings: {
      type: Map,
      required: true,
      of: Number,
    },
    activePatron: {
      type: String,
      required: true,
    },
    activePatronLastChanged: {
      type: Date,
      required: false,
    },
  },
  {
    collection: "user_patron_profiles",
    timestamps: true,
    toJSON: { virtuals: true },
  },
);
userPatronProfileSchema.virtual("userDetails", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
  justOne: true,
});
userPatronProfileSchema.index({ user: 1, course: 1 }, { unique: true });
var userPatronProfileModel = mongoose.model(
  "UserPatronProfile",
  userPatronProfileSchema,
);

module.exports = userPatronProfileModel;
