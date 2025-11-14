var Course = require("../models/course");
const CourseRegistration = require("../models/courseRegistration");
var Quiz = require("../models/quiz");
var Activity = require("../models/activity");
var ScheduledQuiz = require("../models/scheduledQuiz");
var ActivityUserAnswer = require("../models/logs/activityUserAnswer");
var ActivityFeedbackView = require("../models/logs/activityFeedbackView");
var SurveyAnswer = require("../models/logs/surveyAnswer");
var PlayContext = require("../models/logs/playContext");
const AppFeedback = require("../models/logs/appFeedback");
const Achievement = require("../models/achievement");
const UserAchievement = require("../models/userAchievement");
var mongoose = require("mongoose");
const logger = require("./logger");

// Helper function to populate (replace references with the actual documents) the activities in a course document.
function populateCourse(course) {
  return Course.populate(course, [
    { path: "sessions.topics", model: "Topic" },
    {
      path: "sessions.scheduledQuizzes.quiz",
      model: "Quiz",
      populate: {
        path: "activities",
        model: "Activity",
        populate: { path: "topics", model: "Topic" },
      },
    },
    {
      path: "trialQuiz",
      model: "Quiz",
      populate: {
        path: "activities",
        model: "Activity",
        populate: { path: "topics", model: "Topic" },
      },
    },
    /// TODO: rework?
    //{ path: "activities", model: "ChoiceActivity" },
  ]);
}

// Helper function to populate (replace references with the actual documents) the activities in a course document.
// TODO: fix (why is it returning when it uses res callback)
async function populateQuiz(quiz) {
  // [{ path: "activities", model: "Activity" }, { path: "activities", model: "ChoiceActivity" }, { path: "activities", model: "RecallActivity" }]
  return Quiz.populate(quiz, [
    {
      path: "activities",
      model: "Activity",
      populate: { path: "topics", model: "Topic" },
    },
  ]);
}

async function populateActivity(activity) {
  return Activity.BaseActivity.populate(activity, [
    { path: "topics", model: "Topic" },
  ]);
}

async function populateActivities(activities) {
  return Activity.BaseActivity.populate(activities, [
    { path: "topics", model: "Topic" },
  ]);
}

function getCourseScheduledQuizzes(courseIds, res) {
  Course.aggregate(
    [
      {
        $match: {
          _id: {
            $in: Array.isArray(courseIds)
              ? courseIds.map((c) => mongoose.Types.ObjectId(c))
              : [mongoose.Types.ObjectId(courseIds)],
          },
        },
      },
      { $unwind: "$sessions" },
      { $unwind: "$sessions.scheduledQuizzes" },
      { $project: { _id: 0, scheduledQuizzes: "$sessions.scheduledQuizzes" } },
    ],
    function (err, arrayResult) {
      if (err) {
        res(err, null);
      } else {
        if (
          arrayResult &&
          Array.isArray(arrayResult) &&
          arrayResult.length > 0
        ) {
          res(
            null,
            [...new Set(arrayResult.map((r) => r["scheduledQuizzes"]))].map(
              (r) => new ScheduledQuiz.model(r),
            ),
          );
        } else {
          res(null, null);
        }
      }
    },
  );
}

function getCourseQuizzes(courseIds, res) {
  Course.aggregate(
    [
      {
        $match: {
          _id: { $in: courseIds.map((c) => mongoose.Types.ObjectId(c)) },
        },
      },
      { $unwind: "$sessions" },
      { $unwind: "$sessions.scheduledQuizzes" },
      { $project: { _id: 0, quiz: "$sessions.scheduledQuizzes.quiz" } },
    ],
    function (err, arrayResult) {
      if (err) {
        res(err, null);
      } else {
        if (
          arrayResult &&
          Array.isArray(arrayResult) &&
          arrayResult.length > 0
        ) {
          res(null, [...new Set(arrayResult.map((r) => r["quiz"]))]);
        } else {
          res(null, null);
        }
      }
    },
  );
}

async function findScheduledQuiz(scheduledQuizId) {
  if (!mongoose.isValidObjectId(scheduledQuizId)) {
    logger.error(
      `[ModelHelper.findScheduledQuiz] Invalid scheduledQuizId: ${scheduledQuizId}`,
    );
    return null;
  }
  const id = mongoose.Types.ObjectId(scheduledQuizId);
  // Note that scheduled quizzes are subdocuments of CourseSessions which are also subdocuments of Courses,
  // hence the parent Course needs to be found.
  try {
    const result = await Course.aggregate([
      // Filter out Courses which do not have a scheduled quiz with the given _id
      { $match: { "sessions.scheduledQuizzes._id": id } },
      // We narrow down the matching Courses to their sessions field
      { $unwind: "$sessions" },
      // We narrow down further to each session's scheduledQuizzes field
      { $unwind: "$sessions.scheduledQuizzes" },
      // Finally, we retain only the scheduled quizzes with the given _id
      { $match: { "sessions.scheduledQuizzes._id": id } },
      // We retain only the data we need.
      // We don't want the top-level "_id", because it is the Course's _id.
      // Instead, we map the course's id to a new "courseId" field.
      {
        $project: {
          _id: 0,
          scheduledQuiz: "$sessions.scheduledQuizzes",
          courseId: "$_id",
          sessionId: "$sessions._id",
        },
      },
      { $limit: 1 },
    ]).exec();

    if (!result || result.length === 0) {
      logger.error(
        `[ModelHelper.findScheduledQuiz] Failed to find scheduled quiz: ${scheduledQuizId}`,
      );
      return null;
    }
    // aggregate() returns an array. Here, we just want one element (the first).
    const singularResult = result[0];
    const scheduledQuiz = singularResult.scheduledQuiz;
    scheduledQuiz._courseId = singularResult.courseId;
    scheduledQuiz._sessionId = singularResult.sessionId;

    return new ScheduledQuiz.model(scheduledQuiz);
  } catch (err) {
    logger.error(
      `[ModelHelper.findScheduledQuiz] [ERROR] Failed to find scheduled quiz: ${scheduledQuizId}: ${err}`,
    );
    return null;
  }
}

async function findQuiz(quizId) {
  return Quiz.findById(quizId).populate("activities").exec();
}

async function findCourseFromScheduledQuiz(scheduledQuizId, populate) {
  if (populate) {
    return Course.findOne({
      "sessions.scheduledQuizzes._id": mongoose.Types.ObjectId(scheduledQuizId),
    })
      .exec()
      .then((course) => {
        /// TODO: check if works
        return populateCourse(course);
      });
  } else {
    return Course.findOne({
      "sessions.scheduledQuizzes._id": mongoose.Types.ObjectId(scheduledQuizId),
    }).exec();
  }
}

async function findCourseAndSession(scheduledQuizId) {
  var arrayResult = await Course.aggregate([
    // Match by the given scheduled quiz id
    {
      $match: {
        "sessions.scheduledQuizzes._id":
          mongoose.Types.ObjectId(scheduledQuizId),
      },
    },
    // Unwind the sessions array of the found Course
    { $unwind: "$sessions" },
    // Match only the session which contains the found scheduled quiz
    {
      $match: {
        "sessions.scheduledQuizzes._id":
          mongoose.Types.ObjectId(scheduledQuizId),
      },
    },
  ]);
  if (arrayResult && Array.isArray(arrayResult) && arrayResult.length > 0) {
    var course = arrayResult[0];
    var courseSession = course.sessions;

    delete course["sessions"];

    return { course: course, courseSession: courseSession };
  } else {
    return null;
  }
}

/// Properties are not populated, such as topics list.
async function retrieveCourseSession(courseSessionId) {
  return Course.findOne({
    "sessions._id": mongoose.Types.ObjectId(courseSessionId),
  })
    .exec()
    .then((course) => {
      if (!course) {
        return null;
      }
      var courseSession = course.sessions
        .filter(function (session) {
          return session._id.toString() === courseSessionId.toString();
        })
        .pop();
      return courseSession;
    });
}

async function retrieveSession(course, scheduledQuizId, populateQuizzes) {
  for (var i = 0; i < course.sessions.length; i++) {
    for (var j = 0; j < course.sessions[i].scheduledQuizzes.length; j++) {
      if (
        course.sessions[i].scheduledQuizzes[j]._id.toString() ===
        scheduledQuizId.toString()
      ) {
        var session = course.sessions[i];
        if (populateQuizzes) {
          for (var k = 0; k < session.scheduledQuizzes.length; k++) {
            var populatedQuiz = await Quiz.findById(
              session.scheduledQuizzes[k].quiz,
            )
              .populate("activities")
              .exec();

            if (populatedQuiz) {
              session.scheduledQuizzes[k].quiz = populatedQuiz;
            }
          }
        }
        return session;
      }
    }
  }
  return null;
}

function retrieveScheduledQuizFromPopulatedSession(session, scheduledQuizId) {
  for (var i = 0; i < session.scheduledQuizzes.length; i++) {
    if (
      session.scheduledQuizzes[i]._id.toString() === scheduledQuizId.toString()
    ) {
      return session.scheduledQuizzes[i];
    }
  }
  return null;
}

/**
 * Retrieves the courses to which the user is registered.
 * @param  {[string]} userId The method handles conversion to mongoose.Types.ObjectId
 * @param  {[boolean]} asCourseObjects If true, Course models are returned. Otherwise, JS dictionaries are returned.
 * @return {[type]}      Array of courses which are NOT populated.
 */
async function getUserRegisteredCourses(userId, asCourseObjects) {
  // return Course.find().exec();
  return CourseRegistration.find({
    user: mongoose.Types.ObjectId(userId),
    isActive: { $eq: true },
  })
    .exec()
    .then((result) => {
      if (!result) {
        return [];
      } else {
        return Course.find({
          _id: {
            $in: result.map((courseRegistration) =>
              mongoose.Types.ObjectId(courseRegistration.course),
            ),
          },
        })
          .exec()
          .then((courses) => {
            if (!courses) {
              return [];
            } else {
              if (asCourseObjects) {
                return courses.map((c) => new Course(c));
              } else {
                return courses;
              }
            }
          });
      }
    });
  // var operation = Course.aggregate([
  //   {
  //     $lookup: {
  //       from: "course_registrations",
  //       localField: "_id",
  //       foreignField: "course",
  //       as: "course_registrations",
  //     },
  //   },
  //   {
  //     $match: {
  //       "course_registrations.user": {
  //         $eq: mongoose.Types.ObjectId(userId),
  //       },
  //       "course_registrations.isActive": { $eq: true },
  //     },
  //   },
  //   { $unset: ["course_registrations"] },
  // ]).exec();
  // /// The result of aggregate is JS objects (essentialy dictionaries), rather than actual Course objects.
  // /// This is different from Course.find(), which returns Course objects
  // if (asCourseObjects) {
  //   var result = await operation;
  //   return result.map((c) => new Course(c));
  // } else {
  //   return operation;
  // }
}

function decodeActivity(activityJSON) {
  var activity;
  var activityType = activityJSON["kind"];
  if (activityType == "ChoiceActivity") {
    activity = new Activity.ChoiceActivity(activityJSON);
  } else if (activityType == "DartBlockActivity") {
    activity = new Activity.DartBlockActivity(activityJSON);
  } else {
    logger.error("Activity creation failed: Unknown activity type.");
  }
  return activity;
}

function decodeActivityUserAnswer(json) {
  var activityUserAnswer;
  try {
    var answerType = json["activityAnswerType"];
    if (answerType == "choiceAnswer") {
      if (Array.isArray(json["answers"])) {
        // no conversion needed
      } else {
        logger.warn(
          "Converting old schema of activity user answer field 'answers' from Map to Array: " +
            JSON.stringify(json["answers"]),
        );
        let answers = [];
        for (let key in json["answers"]) {
          answers.push({ answer: key, evaluation: json["answers"][key] });
        }
        json["answers"] = answers;
      }
      activityUserAnswer = new ActivityUserAnswer.ChoiceActivityUserAnswer(
        json,
      );
    } else if (answerType == "recallAnswer") {
      if (Array.isArray(json["answers"])) {
        // no conversion needed
      } else {
        logger.warn(
          "Converting old schema of activity user answer field 'answers' from Map to Array: " +
            JSON.stringify(json["answers"]),
        );
        let answers = [];
        for (let key in json["answers"]) {
          answers.push({ answer: key, evaluation: json["answers"][key] });
        }
        json["answers"] = answers;
      }
      activityUserAnswer = new ActivityUserAnswer.RecallActivityUserAnswer(
        json,
      );
    } else if (answerType == "dartblockAnswer") {
      activityUserAnswer = new ActivityUserAnswer.DartBlockActivityUserAnswer(
        json,
      );
    } else {
      logger.error(
        "Activity answer logging failed: Unknown activity answer type.",
      );
    }
  } catch (err) {
    logger.error(err);
  }
  return activityUserAnswer;
}

function decodeActivityFeedbackView(json) {
  var activityFeedbackView;
  try {
    var kind = json["kind"];
    if (kind == "ChoiceActivityFeedbackView") {
      activityFeedbackView =
        new ActivityFeedbackView.ChoiceActivityFeedbackView(json);
    } else if (kind == "DartBlockActivityFeedbackView") {
      activityFeedbackView =
        new ActivityFeedbackView.DartBlockActivityFeedbackView(json);
    } else {
      logger.error("Activity feedback view decoding failed: Unknown kind.");
    }
  } catch (err) {
    logger.error(err);
  }
  return activityFeedbackView;
}

function decodeAchievement(json) {
  var achievement;
  try {
    achievement = new Achievement(json);
  } catch (err) {
    logger.error(err);
  }
  return achievement;
}

function decodeUserAchievement(json) {
  var userAchievement;
  try {
    userAchievement = new UserAchievement(json);
  } catch (err) {
    logger.error(err);
  }
  return userAchievement;
}

function decodeSurveyAnswer(json) {
  var surveyAnswer;
  try {
    surveyAnswer = new SurveyAnswer(json);
  } catch (err) {
    logger.error(err);
  }
  return surveyAnswer;
}

function decodePlayContext(json) {
  var playContext;
  try {
    playContext = new PlayContext(json);
  } catch (err) {
    logger.error(err);
  }
  return playContext;
}

function decodeAppFeedback(json) {
  var appFeedback;
  try {
    appFeedback = new AppFeedback(json);
  } catch (err) {
    logger.error(err);
  }
  return appFeedback;
}

module.exports = {
  populateCourse,
  populateQuiz,
  populateActivity,
  populateActivities,
  getCourseScheduledQuizzes,
  getCourseQuizzes,
  findScheduledQuiz,
  findQuiz,
  findCourseFromScheduledQuiz,
  findCourseAndSession,
  retrieveCourseSession,
  retrieveSession,
  retrieveScheduledQuizFromPopulatedSession,
  getUserRegisteredCourses,
  decodeActivity,
  decodeActivityUserAnswer,
  decodeActivityFeedbackView,
  decodeAchievement,
  decodeUserAchievement,
  decodeSurveyAnswer,
  decodePlayContext,
  decodeAppFeedback,
};
