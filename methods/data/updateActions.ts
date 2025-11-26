import { CourseDocument, CourseModel } from '../../models/course';
import ModelHelper from '../../middleware/modelHelper';
import { QuizDocument, QuizModel } from '../../models/quiz';
import { ActivityDocument, ActivityModel } from '../../models/activity';
import { TopicDocument, TopicModel } from '../../models/topic';
import logger from '../../middleware/logger';
import mongoose from 'mongoose';
import { Response } from 'express';

// Possible status codes
enum CheckForUpdatesStatus {
  UpdatesAvailable = 200,
  UpToDate = 209,
  MissingArguments = 400,
  CoursesNotFound = 452,
  InternalError = 500,
}

enum CheckForQuizUpdatesStatus {
  UpdatesAvailable = 200,
  UpToDate = 209,
  MissingArguments = 400,
  QuizzesNotFound = 452,
  InternalError = 500,
}

enum CheckForActivityUpdatesStatus {
  UpdatesAvailable = 200,
  UpToDate = 209,
  MissingArguments = 400,
  ActivitiesNotFound = 452,
  InternalError = 500,
}

enum CheckForTopicUpdatesStatus {
  UpdatesAvailable = 200,
  UpToDate = 209,
  MissingArguments = 400,
  TopicsNotFound = 452,
  InternalError = 500,
}

const functions = {
  checkForCourseUpdates: async function (
    req: Express.AuthenticatedRequest<{}, {}, { courses: string }>,
    res: Response
  ) {
    if (!req.body.courses) {
      return res
        .status(CheckForUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify courses." });
    }
    let usersCourses: { id: string; version: string }[];
    try {
      usersCourses = JSON.parse(req.body.courses);
    } catch (_: unknown) {
      return res.status(CheckForUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify courses (invalid ids).",
      });
    }

    if (!Array.isArray(usersCourses) || usersCourses.length === 0) {
      return res.status(CheckForUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify courses (empty).",
      });
    }

    const clientVersionById = new Map<string, number>();
    const courseObjectIds: mongoose.Types.ObjectId[] = [];
    for (const uc of usersCourses) {
      const id = uc.id;
      const v = Number.parseInt(uc.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      courseObjectIds.push(new mongoose.Types.ObjectId(id));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (courseObjectIds.length === 0) {
      return res.status(CheckForUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const courses = await CourseModel.find({
        _id: { $in: courseObjectIds },
      }).exec();
      if (!courses || courses.length === 0) {
        return res.status(CheckForUpdatesStatus.CoursesNotFound).send({
          message: "Can't check for updates: courses could not be found.",
        });
      }
      const coursesToUpdate: CourseDocument[] = [];
      for (const course of courses) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(course._id))) continue;
        const clientVersion = clientVersionById.get(String(course._id));
        if (clientVersion && clientVersion < course.version) {
          coursesToUpdate.push(course);
        }
      }

      if (coursesToUpdate.length === 0) {
        return res
          .status(CheckForUpdatesStatus.UpToDate)
          .send({ message: 'Courses are already up to date.' });
      }

      const populatedCourses =
        await ModelHelper.populateCourse(coursesToUpdate);
      if (!populatedCourses) {
        return res.status(CheckForUpdatesStatus.CoursesNotFound).send({
          message: "Can't check for updates: courses could not be populated.",
        });
      }
      return res.status(CheckForUpdatesStatus.UpdatesAvailable).send({
        message: 'Updates are available.',
        // TODO: toJSON?
        courses: JSON.parse(JSON.stringify(populatedCourses)),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(CheckForUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
  checkForQuizUpdates: async function (
    req: Express.AuthenticatedRequest<{}, {}, { quizzes: string }>,
    res: Response
  ) {
    if (!req.body.quizzes) {
      return res
        .status(CheckForQuizUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify quizzes." });
    }

    let usersQuizzes: { id: string; version: string }[];
    try {
      usersQuizzes = JSON.parse(req.body.quizzes);
    } catch (_: unknown) {
      return res.status(CheckForQuizUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify quizzes (invalid ids).",
      });
    }

    if (!Array.isArray(usersQuizzes) || usersQuizzes.length === 0) {
      return res.status(CheckForQuizUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify quizzes (empty).",
      });
    }

    const clientVersionById = new Map<string, number>();
    const quizObjectIds: mongoose.Types.ObjectId[] = [];
    for (const uq of usersQuizzes) {
      const id = uq.id;
      const v = Number.parseInt(uq.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      quizObjectIds.push(new mongoose.Types.ObjectId(id));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (quizObjectIds.length === 0) {
      return res.status(CheckForQuizUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const quizzes = await QuizModel.find({
        _id: { $in: quizObjectIds },
      }).exec();
      if (!quizzes || quizzes.length === 0) {
        return res.status(CheckForQuizUpdatesStatus.QuizzesNotFound).send({
          message: "Can't check for updates: quizzes could not be found.",
        });
      }

      const quizzesToUpdate: QuizDocument[] = [];
      for (const quiz of quizzes) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(quiz._id))) continue;
        const clientVersion = clientVersionById.get(String(quiz._id));
        if (clientVersion && clientVersion < quiz.version) {
          quizzesToUpdate.push(quiz);
        }
      }
      if (quizzesToUpdate.length === 0) {
        return res
          .status(CheckForQuizUpdatesStatus.UpToDate)
          .send({ message: 'Quizzes are already up to date.' });
      }

      const populatedQuizzes = await ModelHelper.populateQuiz(quizzesToUpdate);
      if (!populatedQuizzes) {
        return res.status(CheckForQuizUpdatesStatus.QuizzesNotFound).send({
          message: "Can't check for updates: quizzes could not be populated.",
        });
      }
      return res.status(CheckForQuizUpdatesStatus.UpdatesAvailable).send({
        message: 'Updates are available.',
        quizzes: Array.isArray(populatedQuizzes)
          ? populatedQuizzes.map((q) => q.toJSON())
          : [populatedQuizzes.toJSON()],
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(CheckForQuizUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
  checkForActivityUpdates: async function (
    req: Express.AuthenticatedRequest<{}, {}, { activities: string }>,
    res: Response
  ) {
    if (!req.body.activities) {
      return res
        .status(CheckForActivityUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify activities." });
    }

    let usersActivities: { id: string; version: string }[];
    try {
      usersActivities = JSON.parse(req.body.activities);
    } catch (_: unknown) {
      return res.status(CheckForActivityUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify activities (invalid ids).",
      });
    }

    if (!Array.isArray(usersActivities) || usersActivities.length === 0) {
      return res.status(CheckForActivityUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify activities (empty).",
      });
    }

    const clientVersionById = new Map<string, number>();
    const activityObjectIds: mongoose.Types.ObjectId[] = [];
    for (const ua of usersActivities) {
      const id = ua.id;
      const v = Number.parseInt(ua.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      activityObjectIds.push(new mongoose.Types.ObjectId(id));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (activityObjectIds.length === 0) {
      return res.status(CheckForActivityUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const activities = await ActivityModel.find({
        _id: { $in: activityObjectIds },
      })
        .populate('topics')
        .exec();
      if (!activities || activities.length === 0) {
        return res
          .status(CheckForActivityUpdatesStatus.ActivitiesNotFound)
          .send({
            message: "Can't check for updates: activities could not be found.",
          });
      }
      const activitiesToUpdate: ActivityDocument[] = [];
      for (const activity of activities) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(activity._id))) continue;
        const clientVersion = clientVersionById.get(String(activity._id));
        if (clientVersion && clientVersion < activity.version) {
          activitiesToUpdate.push(activity);
        }
      }
      if (activitiesToUpdate.length === 0) {
        return res
          .status(CheckForActivityUpdatesStatus.UpToDate)
          .send({ message: 'Activities are already up to date.' });
      }

      return res.status(CheckForActivityUpdatesStatus.UpdatesAvailable).send({
        message: 'Updates are available.',
        activities: activitiesToUpdate.map((a) => a.toJSON()),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(CheckForActivityUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
  checkForTopicUpdates: async function (
    req: Express.AuthenticatedRequest<{}, {}, { topics: string }>,
    res: Response
  ) {
    if (!req.body.topics) {
      return res
        .status(CheckForTopicUpdatesStatus.MissingArguments)
        .send({ message: "Can't check for updates: specify topics." });
    }

    let usersTopics: { id: string; version: string }[];
    try {
      usersTopics = JSON.parse(req.body.topics);
    } catch (_: unknown) {
      return res.status(CheckForTopicUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify topics (invalid ids).",
      });
    }

    if (!Array.isArray(usersTopics) || usersTopics.length === 0) {
      return res.status(CheckForTopicUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: specify topics (empty).",
      });
    }

    const clientVersionById = new Map<string, number>();
    const topicObjectIds: mongoose.Types.ObjectId[] = [];
    for (const ut of usersTopics) {
      const id = ut.id;
      const v = Number.parseInt(ut.version, 10);
      if (!id || !mongoose.isValidObjectId(id)) {
        continue;
      }
      topicObjectIds.push(new mongoose.Types.ObjectId(id));
      clientVersionById.set(String(id), Number.isFinite(v) ? v : 0);
    }

    if (topicObjectIds.length === 0) {
      return res.status(CheckForTopicUpdatesStatus.MissingArguments).send({
        message: "Can't check for updates: ids not valid.",
      });
    }

    try {
      const topics = await TopicModel.find({
        _id: { $in: topicObjectIds },
      }).exec();
      if (!topics || topics.length === 0) {
        return res.status(CheckForTopicUpdatesStatus.TopicsNotFound).send({
          message: "Can't check for updates: topics could not be found.",
        });
      }

      const topicsToUpdate: TopicDocument[] = [];
      for (const topic of topics) {
        // do not do !clientVersion: this would include the valid value 0!
        if (!clientVersionById.has(String(topic._id))) continue;
        const clientVersion = clientVersionById.get(String(topic._id));
        if (clientVersion && clientVersion < topic.version) {
          topicsToUpdate.push(topic);
        }
      }
      if (topicsToUpdate.length === 0) {
        return res
          .status(CheckForTopicUpdatesStatus.UpToDate)
          .send({ message: 'Topics are already up to date.' });
      }
      return res.status(CheckForTopicUpdatesStatus.UpdatesAvailable).send({
        message: 'Updates are available.',
        topics: topicsToUpdate.map((t) => t.toJSON()),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(CheckForTopicUpdatesStatus.InternalError).send({
        message: "Can't check for updates: internal error.",
      });
    }
  },
};

export default functions;
