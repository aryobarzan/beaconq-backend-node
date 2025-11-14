var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var userPatronProfileChangeSchema = new Schema(
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
    oldPatron: {
      type: String,
      required: false,
    },
    newPatron: {
      type: String,
      required: true,
    },
  },
  { collection: "user_patron_profile_changes", timestamps: true },
);
var userPatronProfileChangeModel = mongoose.model(
  "UserPatronProfileChange",
  userPatronProfileChangeSchema,
);

module.exports = userPatronProfileChangeModel;
