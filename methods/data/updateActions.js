var Course = require("../../models/course");
const ModelHelper = require("../../middleware/modelHelper");
const Quiz = require("../../models/quiz");
const Activity = require("../../models/activity");
const Topic = require("../../models/topic");
const logger = require("../../middleware/logger");
var mongoose = require("mongoose");

// Possible status codes
const CheckForUpdatesStatus = Object.freeze({
  UpdatesAvailable: 200,
  UpToDate: 209,
  MissingArguments: 400,
  CoursesNotFound: 452,
  InternalError: 500,
});

const CheckForQuizUpdatesStatus = Object.freeze({
  UpdatesAvailable: 200,
  UpToDate: 209,
  MissingArguments: 400,
  QuizzesNotFound: 452,
  InternalError: 500,
});

const CheckForActivityUpdatesStatus = Object.freeze({
  UpdatesAvailable: 200,
  UpToDate: 209,
  MissingArguments: 400,
  ActivitiesNotFound: 452,
  InternalError: 500,
});

const CheckForTopicUpdatesStatus = Object.freeze({
  UpdatesAvailable: 200,
  UpToDate: 209,
  MissingArguments: 400,
  TopicsNotFound: 452,
  InternalError: 500,
});
// Possible status codes

var functions = {
  checkForCourseUpdates: async function (req, res) {
    if (!req.body.courses) {
      return res
        .status(CheckForUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify courses." });
    }
    let usersCourses;
    try {
      usersCourses = JSON.parse(req.body.courses);
    } catch (err) {
      return res.status(CheckForUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify courses (invalid ids).",
      });
    }

    if (!Array.isArray(usersCourses) || usersCourses.length === 0) {
      return res.status(CheckForUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify courses (empty).",
      });
    }

    const clientVersionById = new Map();
    const courseObjectIds = [];
    for (const uc of usersCourses) {
      const id = uc.id;
      const v = Number.parseInt(uc.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      courseObjectIds.push(new mongoose.Types.ObjectId(String(id)));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (courseObjectIds.length === 0) {
      return res.status(CheckForUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const courses = await Course.find({
        _id: { $in: courseObjectIds },
      }).exec();
      if (!courses || courses.length === 0) {
        return res.status(CheckForUpdatesStatus.CoursesNotFound).send({
          message: "Can't check for updates: courses could not be found.",
        });
      }
      const coursesToUpdate = [];
      for (const course of courses) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(course._id))) continue;
        const clientVersion = clientVersionById.get(String(course._id));
        if (clientVersion < course.version) {
          coursesToUpdate.push(course);
        }
      }

      if (coursesToUpdate.length === 0) {
        return res
          .status(CheckForUpdatesStatus.UpToDate)
          .send({ message: "Courses are already up to date." });
      }

      const populatedCourses =
        await ModelHelper.populateCourse(coursesToUpdate);
      if (!populatedCourses) {
        return res.status(CheckForUpdatesStatus.CoursesNotFound).send({
          message: "Can't check for updates: courses could not be populated.",
        });
      }
      return res.status(CheckForUpdatesStatus.UpdatesAvailable).send({
        message: "Updates are available.",
        // TODO: toJSON?
        courses: JSON.parse(JSON.stringify(populatedCourses)),
      });
    } catch (err) {
      logger.error(err);
      return res.status(CheckForUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
  checkForQuizUpdates: async function (req, res) {
    if (!req.body.quizzes) {
      return res
        .status(CheckForQuizUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify quizzes." });
    }

    let usersQuizzes;
    try {
      usersQuizzes = JSON.parse(req.body.quizzes);
    } catch (err) {
      return res.status(CheckForQuizUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify quizzes (invalid ids).",
      });
    }

    if (!Array.isArray(usersQuizzes) || usersQuizzes.length === 0) {
      return res.status(CheckForQuizUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify quizzes (empty).",
      });
    }

    const clientVersionById = new Map();
    const quizObjectIds = [];
    for (const uq of usersQuizzes) {
      const id = uq.id;
      const v = Number.parseInt(uq.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      quizObjectIds.push(new mongoose.Types.ObjectId(String(id)));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (quizObjectIds.length === 0) {
      return res.status(CheckForQuizUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const quizzes = await Quiz.find({ _id: { $in: quizObjectIds } }).exec();
      if (!quizzes || quizzes.length === 0) {
        return res.status(CheckForQuizUpdatesStatus.QuizzesNotFound).send({
          message: "Can't check for updates: quizzes could not be found.",
        });
      }

      const quizzesToUpdate = [];
      for (const quiz of quizzes) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(quiz._id))) continue;
        const clientVersion = clientVersionById.get(String(quiz._id));
        if (clientVersion < quiz.version) {
          quizzesToUpdate.push(quiz);
        }
      }
      if (quizzesToUpdate.length === 0) {
        return res
          .status(CheckForQuizUpdatesStatus.UpToDate)
          .send({ message: "Quizzes are already up to date." });
      }

      const populatedQuizzes = await ModelHelper.populateQuiz(quizzesToUpdate);
      if (!populatedQuizzes) {
        return res.status(CheckForQuizUpdatesStatus.QuizzesNotFound).send({
          message: "Can't check for updates: quizzes could not be populated.",
        });
      }
      return res.status(CheckForQuizUpdatesStatus.UpdatesAvailable).send({
        message: "Updates are available.",
        quizzes: populatedQuizzes.map((q) => q.toJSON()),
      });
    } catch (err) {
      logger.error(err);
      return res.status(CheckForQuizUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
  checkForActivityUpdates: async function (req, res) {
    if (!req.body.activities) {
      return res
        .status(CheckForActivityUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify activities." });
    }

    let usersActivities;
    try {
      usersActivities = JSON.parse(req.body.activities);
    } catch (err) {
      return res.status(CheckForActivityUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify activities (invalid ids).",
      });
    }

    if (!Array.isArray(usersActivities) || usersActivities.length === 0) {
      return res.status(CheckForActivityUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify activities (empty).",
      });
    }

    const clientVersionById = new Map();
    const activityObjectIds = [];
    for (const ua of usersActivities) {
      const id = ua.id;
      const v = Number.parseInt(ua.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      activityObjectIds.push(new mongoose.Types.ObjectId(String(id)));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (activityObjectIds.length === 0) {
      return res.status(CheckForActivityUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const activities = await Activity.BaseActivity.find({
        _id: { $in: activityObjectIds },
      })
        .populate("topics")
        .exec();
      if (!activities || activities.length === 0) {
        return res
          .status(CheckForActivityUpdatesStatus.ActivitiesNotFound)
          .send({
            message: "Can't check for updates: activities could not be found.",
          });
      }
      const activitiesToUpdate = [];
      for (const activity of activities) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(activity._id))) continue;
        const clientVersion = clientVersionById.get(String(activity._id));
        if (clientVersion < activity.version) {
          activitiesToUpdate.push(activity);
        }
      }
      if (activitiesToUpdate.length === 0) {
        return res
          .status(CheckForActivityUpdatesStatus.UpToDate)
          .send({ message: "Activities are already up to date." });
      }

      return res.status(CheckForActivityUpdatesStatus.UpdatesAvailable).send({
        message: "Updates are available.",
        activities: activitiesToUpdate,
      });
    } catch (err) {
      logger.error(err);
      return res.status(CheckForActivityUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
  checkForTopicUpdates: async function (req, res) {
    if (!req.body.topics) {
      return res
        .status(CheckForTopicUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify topics." });
    }

    let usersTopics;
    try {
      usersTopics = JSON.parse(req.body.topics);
    } catch (err) {
      return res.status(CheckForTopicUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify topics (invalid ids).",
      });
    }

    if (!Array.isArray(usersTopics) || usersTopics.length === 0) {
      return res.status(CheckForTopicUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify topics (empty).",
      });
    }

    const clientVersionById = new Map();
    const topicObjectIds = [];
    for (const ut of usersTopics) {
      const id = ut.id;
      const v = Number.parseInt(ut.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      topicObjectIds.push(new mongoose.Types.ObjectId(String(id)));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (topicObjectIds.length === 0) {
      return res.status(CheckForTopicUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const topics = await Topic.find({ _id: { $in: topicObjectIds } }).exec();
      if (!topics || topics.length === 0) {
        return res.status(CheckForTopicUpdatesStatus.TopicsNotFound).send({
          message: "Can't check for updates: topics could not be found.",
        });
      }

      const topicsToUpdate = [];
      for (const topic of topics) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(topic._id))) continue;
        const clientVersion = clientVersionById.get(String(topic._id));
        if (clientVersion < topic.version) {
          topicsToUpdate.push(topic);
        }
      }
      if (topicsToUpdate.length === 0) {
        return res
          .status(CheckForTopicUpdatesStatus.UpToDate)
          .send({ message: "Topics are already up to date." });
      }
      return res.status(CheckForTopicUpdatesStatus.UpdatesAvailable).send({
        message: "Updates are available.",
        topics: topicsToUpdate,
      });
    } catch (err) {
      logger.error(err);
      return res.status(CheckForTopicUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
};

module.exports = functions;
