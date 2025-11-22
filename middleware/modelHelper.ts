import { Course, CourseModel, CourseDocument } from "../models/course";
import { CourseSession } from "../models/courseSession";
import { CourseRegistrationModel } from "../models/courseRegistration";
import { Quiz, QuizModel, QuizDocument } from "../models/quiz";
import { ActivityDocument, ActivityModel, ChoiceActivityDocument, ChoiceActivityModel, DartBlockActivityDocument, DartBlockActivityModel } from "../models/activity";
import { ScheduledQuizDocument, model as ScheduledQuizModel } from "../models/scheduledQuiz";
import { ChoiceActivityUserAnswerModel, RecallActivityUserAnswerModel, DartBlockActivityUserAnswerModel, ChoiceActivityUserAnswerDocument, RecallActivityUserAnswerDocument, DartBlockActivityUserAnswerDocument } from "../models/logs/activityUserAnswer";
import { ChoiceActivityFeedbackViewModel, DartBlockActivityFeedbackViewModel, ChoiceActivityFeedbackViewDocument, DartBlockActivityFeedbackViewDocument } from "../models/logs/activityFeedbackView";
import { SurveyAnswerModel, SurveyAnswerDocument } from "../models/logs/surveyAnswer";
import { PlayContextModel, PlayContextDocument } from "../models/logs/playContext";
import { AppFeedbackModel, AppFeedbackDocument } from "../models/logs/appFeedback";
import { model as AchievementModel, AchievementDocument } from "../models/achievement";
import { model as UserAchievementModel, UserAchievementDocument } from "../models/userAchievement";
import mongoose from "mongoose";
import logger from "./logger";



const functions = {
  // Helper function to populate (replace references with the actual documents) the activities in a course document.
  populateCourse: async function (course: CourseDocument | CourseDocument[]): Promise<CourseDocument> {
    return CourseModel.populate(course, [
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
    ]);
  },

  // Helper function to populate (replace references with the actual documents) the activities in a course document.
  populateQuiz: async function (quiz: QuizDocument | QuizDocument[]): Promise<QuizDocument | QuizDocument[]> {
    return QuizModel.populate(quiz, [
      {
        path: "activities",
        model: "Activity",
        populate: { path: "topics", model: "Topic" },
      },
    ]);
  },

  populateActivity: async function (activity: ActivityDocument): Promise<ActivityDocument> {
    return ActivityModel.populate(activity, [
      { path: "topics", model: "Topic" },
    ]);
  },

  populateActivities: async function (activities: ActivityDocument[]): Promise<ActivityDocument[]> {
    return ActivityModel.populate(activities, [
      { path: "topics", model: "Topic" },
    ]);
  },

  findScheduledQuiz: async function (scheduledQuizId: string): Promise<ScheduledQuizDocument | null> {
    if (!mongoose.isValidObjectId(scheduledQuizId)) {
      logger.error(
        `[ModelHelper.findScheduledQuiz] Invalid scheduledQuizId: ${scheduledQuizId}`,
      );
      return null;
    }
    const id = new mongoose.Types.ObjectId(scheduledQuizId);
    // Note that scheduled quizzes are subdocuments of CourseSessions which are also subdocuments of Courses,
    // hence the parent Course needs to be found.
    try {
      const result = await CourseModel.aggregate([
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

      return new ScheduledQuizModel(scheduledQuiz);
    } catch (err) {
      logger.error(
        `[ModelHelper.findScheduledQuiz] [ERROR] Failed to find scheduled quiz: ${scheduledQuizId}: ${err}`,
      );
      return null;
    }
  },

  findQuiz: async function (quizId: string): Promise<Quiz | null> {
    return QuizModel.findById(quizId).populate("activities").exec();
  },

  findCourseAndSession: async function (scheduledQuizId: string): Promise<{ course: Course; courseSession: CourseSession } | null> {
    const scheduledQuizObjectId = new mongoose.Types.ObjectId(scheduledQuizId);
    const arrayResult = await CourseModel.aggregate([
      // Match by the given scheduled quiz id
      {
        $match: {
          "sessions.scheduledQuizzes._id":
            scheduledQuizObjectId,
        },
      },
      // Unwind the sessions array of the found Course
      { $unwind: "$sessions" },
      // Match only the session which contains the found scheduled quiz
      {
        $match: {
          "sessions.scheduledQuizzes._id":
            scheduledQuizObjectId,
        },
      },
    ]);
    if (arrayResult && Array.isArray(arrayResult) && arrayResult.length > 0) {
      const course = arrayResult[0];
      const courseSession = course.sessions;
      // use destructuring instead of "delete" keyword to remove "sessions" field from course object
      const { sessions, ...courseWithoutSessions } = course;

      return { course: courseWithoutSessions, courseSession: courseSession };
    } else {
      return null;
    }
  },

  /// Properties are not populated, such as topics list.
  retrieveCourseSession: async function (courseSessionId: string): Promise<CourseSession | null> {
    const course = await CourseModel.findOne({
      "sessions._id": new mongoose.Types.ObjectId(courseSessionId),
    })
      .exec();
    if (!course) {
      return null;
    }
    const courseSession = course.sessions
      .filter((session) => {
        return session._id.toString() === courseSessionId.toString();
      })
      .pop();
    return courseSession;
  },

  /**
   * Retrieves the courses to which the user is registered.
   * @param  {[string]} userId The method handles conversion to mongoose.Types.ObjectId
   * @return {[type]}      Array of courses which are NOT populated.
   */
  getUserRegisteredCourses: async function (userId: string): Promise<CourseDocument[]> {
    const courseRegistrations = await CourseRegistrationModel.find({
      user: new mongoose.Types.ObjectId(userId),
      isActive: { $eq: true },
    })
      .exec();
    if (!courseRegistrations) {
      return [];
    } else {
      const courses = await CourseModel.find({
        _id: {
          $in: courseRegistrations.map((courseRegistration) =>
            courseRegistration.course,
          ),
        },
      })
        .exec();
      if (!courses) {
        return [];
      } else {
        return courses
      }
    }
  },

  decodeActivity: function (activityJSON: any): ChoiceActivityDocument | DartBlockActivityDocument | null {
    let activity: ChoiceActivityDocument | DartBlockActivityDocument | null = null;
    if (!activityJSON || !activityJSON["kind"]) {
      logger.error("Activity creation failed: Invalid activity JSON.");
      return null;
    }
    try {
      const activityType = String(activityJSON["kind"]);
      if (activityType === "ChoiceActivity") {
        activity = new ChoiceActivityModel(activityJSON);
      } else if (activityType === "DartBlockActivity") {
        activity = new DartBlockActivityModel(activityJSON);
      } else {
        logger.error("Activity creation failed: Unknown activity type.");
      }
    } catch (err) {
      logger.error(err);
    }
    return activity;
  },

  decodeActivityUserAnswer: function (json: any): ChoiceActivityUserAnswerDocument | RecallActivityUserAnswerDocument | DartBlockActivityUserAnswerDocument | null {
    let activityUserAnswer: ChoiceActivityUserAnswerDocument | RecallActivityUserAnswerDocument | DartBlockActivityUserAnswerDocument | null = null;
    if (!json || !json["activityAnswerType"]) {
      logger.error("Activity user answer creation failed: Invalid activity user answer JSON.");
      return null;
    }
    try {
      const answerType = String(json["activityAnswerType"]);
      if (answerType === "choiceAnswer") {
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
        activityUserAnswer = new ChoiceActivityUserAnswerModel(
          json,
        );
      } else if (answerType === "recallAnswer") {
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
        activityUserAnswer = new RecallActivityUserAnswerModel(
          json,
        );
      } else if (answerType === "dartblockAnswer") {
        activityUserAnswer = new DartBlockActivityUserAnswerModel(
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
  },

  decodeActivityFeedbackView: function (json: any): ChoiceActivityFeedbackViewDocument | DartBlockActivityFeedbackViewDocument | null {
    let activityFeedbackView: ChoiceActivityFeedbackViewDocument | DartBlockActivityFeedbackViewDocument | null = null;
    if (!json || !json["kind"]) {
      logger.error("Activity feedback view decoding failed: Invalid activity feedback view JSON.");
      return null;
    }
    try {
      const kind = String(json["kind"]);
      if (kind === "ChoiceActivityFeedbackView") {
        activityFeedbackView =
          new ChoiceActivityFeedbackViewModel(json);
      } else if (kind === "DartBlockActivityFeedbackView") {
        activityFeedbackView =
          new DartBlockActivityFeedbackViewModel(json);
      } else {
        logger.error("Activity feedback view decoding failed: Unknown kind.");
      }
    } catch (err) {
      logger.error(err);
    }
    return activityFeedbackView;
  },

  decodeAchievement: function (json: any): AchievementDocument | null {
    let achievement: AchievementDocument | null = null;
    try {
      achievement = new AchievementModel(json);
    } catch (err) {
      logger.error(err);
    }
    return achievement;
  },

  decodeUserAchievement: function (json: any): UserAchievementDocument | null {
    let userAchievement: UserAchievementDocument | null = null;
    try {
      userAchievement = new UserAchievementModel(json);
    } catch (err) {
      logger.error(err);
    }
    return userAchievement;
  },

  decodeSurveyAnswer: function (json: any): SurveyAnswerDocument | null {
    let surveyAnswer: SurveyAnswerDocument | null = null;
    try {
      surveyAnswer = new SurveyAnswerModel(json);
    } catch (err) {
      logger.error(err);
    }
    return surveyAnswer;
  },

  decodePlayContext: function (json: any): PlayContextDocument | null {
    let playContext: PlayContextDocument | null = null;
    try {
      playContext = new PlayContextModel(json);
    } catch (err) {
      logger.error(err);
    }
    return playContext;
  },

  decodeAppFeedback: function (json: any): AppFeedbackDocument | null {
    let appFeedback: AppFeedbackDocument | null = null;
    try {
      appFeedback = new AppFeedbackModel(json);
    } catch (err) {
      logger.error(err);
    }
    return appFeedback;
  }
}

export default functions;