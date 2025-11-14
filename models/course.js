var mongoose = require("mongoose");
var crypto = require("crypto");
var Schema = mongoose.Schema;
const { DateTime } = require("luxon");
var courseSession = require("./courseSession");
const beaconResource = require("./beaconResource");

var courseSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    isManualTopicFocus: {
      type: Boolean,
      required: true,
      default: false,
    },
    registrationLimit: {
      type: Number,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
      required: false,
    },
    accessKey: {
      type: String,
      //required: true,
      unique: true,
      //default: crypto.randomBytes(4).toString("hex").toUpperCase(),
    },
    trialQuiz: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: false,
    },
    // Introduced with BEACON Q 6.2.0
    restrictSubmissionInitially: {
      type: Boolean,
      required: true,
      default: true,
    },
    integrations: [{ type: String }],
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
    /// Deprecated, now use Mongoose's own timestamps createdAt & updatedAt
    // creationDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
    // updateDate: {
    //   type: Date,
    //   default: () => new Date(),
    // },
    sessions: [courseSession.schema],
    beaconResources: [beaconResource.schema],
  },
  { collection: "courses", timestamps: true },
);

courseSchema.pre("save", function (next) {
  var self = this;
  if (!self.accessKey) {
    self.accessKey = crypto.randomBytes(4).toString("hex").toUpperCase();
  }
  next();
});

courseSchema.methods.getSessionOfScheduledQuiz = function (id) {
  for (var i = 0; i < this.sessions.length; i++) {
    for (var j = 0; j < this.sessions[i].scheduledQuizzes.length; j++) {
      if (
        this.sessions[i].scheduledQuizzes[j]._id.toString() === id.toString()
      ) {
        return this.sessions[i];
      }
    }
  }
  return null;
};

courseSchema.methods.getScheduledQuiz = function (id) {
  var session = this.getSessionOfScheduledQuiz(id);
  if (session) {
    for (var i = 0; i < session.scheduledQuizzes.length; i++) {
      if (session.scheduledQuizzes[i]._id.toString() === id.toString()) {
        return session.scheduledQuizzes[i];
      }
    }
  }
  return null;
};

courseSchema.methods.getScheduledQuizzes = function () {
  // Indicate default value [], otherwise a TypeError is thrown due to empty arrays being reduced
  // "TypeError: Reduce of empty array with no initial value"
  return this.sessions
    .map((s) => s.scheduledQuizzes)
    .reduce(function (pre, cur) {
      return pre.concat(cur);
    }, []);
};

courseSchema.methods.getInitialEvaluationQuiz = function () {
  if (this.sessions && this.sessions.length > 0) {
    var sessions = this.sessions.sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime(),
    );
    var firstSession = sessions[0];
    var scheduledQuizzes = firstSession.scheduledQuizzes.sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime(),
    );
    if (scheduledQuizzes && scheduledQuizzes.length > 0) {
      var firstScheduledQuiz = scheduledQuizzes[0];
      var firstScheduledQuizType = this.getScheduledQuizType(
        firstScheduledQuiz._id,
      );
      if (firstScheduledQuizType && firstScheduledQuizType === "pre") {
        return firstScheduledQuiz;
      }
    }
  }
  return null;
};

/// "pre": pre-quiz (before session)
/// "immediate": first post-quiz following immediately after a session
/// "post": any subsequent post-quiz after the immediate post-quiz
courseSchema.methods.getScheduledQuizType = function (id) {
  var scheduledQuiz = this.getScheduledQuiz(id);
  if (!scheduledQuiz) {
    return null;
  }
  var session = this.getSessionOfScheduledQuiz(scheduledQuiz._id);
  if (session) {
    var sessionStartDateTime = DateTime.fromJSDate(session.startDateTime, {
      zone: "utc",
    });
    var scheduledQuizStartDateTime = DateTime.fromJSDate(
      scheduledQuiz.startDateTime,
      { zone: "utc" },
    );
    if (scheduledQuizStartDateTime < sessionStartDateTime) {
      return "pre";
    } else {
      for (var i = 0; i < session.scheduledQuizzes.length; i++) {
        var otherScheduledQuiz = session.scheduledQuizzes[i];
        if (
          scheduledQuiz._id.toString() === otherScheduledQuiz._id.toString()
        ) {
          continue;
        } else {
          var otherQuizStartDateTime = DateTime.fromJSDate(
            otherScheduledQuiz.startDateTime,
          ).setZone("Europe/Paris");
          if (otherQuizStartDateTime < scheduledQuizStartDateTime) {
            return "post";
          }
        }
      }
      return "immediate";
    }
  }
  return null;
};
// To optimize ModelHelper.findCourseAndSession
courseSchema.index({ "sessions.scheduledQuizzes._id": 1 }, { unique: false });
module.exports = mongoose.model("Course", courseSchema);
