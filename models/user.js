var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var bcrypt = require("bcrypt");

var secretQuestionSchema = new Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

var userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER"],
      default: "STUDENT",
      required: true,
    },
    secretQuestions: {
      type: [secretQuestionSchema],
      validate: {
        validator: function (v) {
          return v.length < 4;
        },
        message: (_) =>
          `You cannot set more than 4 secret questions for your account.`,
      },
    },
    date: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
  },
  { collection: "users", timestamps: true },
);

userSchema.pre("save", function (next) {
  var user = this;
  if (this.isModified("password") || this.isNew) {
    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        return next(err);
      }
      bcrypt.hash(user.password, salt, function (err, hash) {
        if (err) {
          return next(err);
        }
        user.password = hash;
        next();
      });
    });
  } else {
    return next();
  }
});

userSchema.methods.comparePassword = async function (passw) {
  return bcrypt.compare(passw, this.password);
};

module.exports = mongoose.model("User", userSchema);
