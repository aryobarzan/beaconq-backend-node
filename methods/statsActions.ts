import mongoose from "mongoose";
import { ActivityUserAnswerModel } from "../models/logs/activityUserAnswer";
import { PlayContextModel } from "../models/logs/playContext";
import { ScheduledQuizUserStartModel } from "../models/logs/scheduledQuizUserStart";
import { SurveyAnswerModel } from "../models/logs/surveyAnswer";
import logger from "../middleware/logger";
import { Response } from "express";

// Possible status codes
enum GetLogsForScheduledQuizzesStatus {
  Retrieved = 200,
  MissingArguments = 400,
  // InvalidScheduledQuizId = 452,
  // PlayPeriodOver = 455,
  // AlreadyPlayedAllActivities = 209,
  // NotYetAvailable = 210,
  InternalError = 500,
}
enum GetSurveyAnswersForScheduledQuizStatus {
  Retrieved = 200,
  MissingArguments = 400,
  InternalError = 500,
}
enum GetTrialQuizAnswersStatus {
  Retrieved = 200,
  MissingArguments = 400,
  InternalError = 500,
}
enum GetActivityUserAnswersStatus {
  Retrieved = 200,
  MissingArguments = 400,
  InternalError = 500,
}

const functions = {
  // Check status of scheduled quizzes
  getLogsForScheduledQuizzes: async function (
    req: Express.AuthenticatedRequest<{}, {}, { scheduledQuizIds: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message:
          "Failed to retrieve log data for scheduled quizzes: teachers only.",
      });
    }
    if (!req.body.scheduledQuizIds) {
      return res
        .status(GetLogsForScheduledQuizzesStatus.MissingArguments)
        .send({
          message:
            "Failed to retrieve log data for scheduled quizzes: missing quiz IDs.",
        });
    }
    let scheduledQuizIdsRaw: any;
    try {
      scheduledQuizIdsRaw = JSON.parse(req.body.scheduledQuizIds);
    } catch (err: unknown) {
      return res
        .status(GetLogsForScheduledQuizzesStatus.MissingArguments)
        .send({
          message:
            "Failed to retrieve log data for scheduled quizzes: invalid quiz IDs.",
        });
    }

    const scheduledQuizIds = [];
    if (Array.isArray(scheduledQuizIdsRaw)) {
      for (const id of scheduledQuizIdsRaw) {
        try {
          scheduledQuizIds.push(new mongoose.Types.ObjectId(String(id)));
        } catch (_) {
          // We just skip invalid IDs
        }
      }
    }

    if (scheduledQuizIds.length === 0) {
      return res
        .status(GetLogsForScheduledQuizzesStatus.MissingArguments)
        .send({
          message:
            "Failed to retrieve log data for scheduled quizzes: no valid quiz IDs.",
        });
    }
    try {
      // Promise 1
      const userAnswersPromise = ActivityUserAnswerModel.find({
        scheduledQuiz: {
          $in: scheduledQuizIds,
        },
      })
        .populate("user", "username role")
        .lean()
        .exec();
      // Promise 2
      const quizUserStartsPromise = ScheduledQuizUserStartModel.find({
        scheduledQuiz: {
          $in: scheduledQuizIds,
        },
      })
        .lean()
        .exec();
      const [userAnswers, quizUserStarts] = await Promise.all([
        userAnswersPromise,
        quizUserStartsPromise,
      ]);

      // Get the answers to each scheduled quiz
      const answersByQuiz = new Map();
      for (const a of userAnswers || []) {
        const key = a.scheduledQuiz ? a.scheduledQuiz.toString() : null;
        const arr = answersByQuiz.get(key) || [];
        arr.push(a);
        answersByQuiz.set(key, arr);
      }

      // Get the user starts for each scheduled quiz
      const startsByQuiz = new Map();
      for (const s of quizUserStarts || []) {
        const key = s.scheduledQuiz ? s.scheduledQuiz.toString() : null;
        const arr = startsByQuiz.get(key) || [];
        arr.push(s);
        startsByQuiz.set(key, arr);
      }

      // We re-build the the results such that they are in the same order as the original
      // scheduled quiz IDs of the request.
      const results = {};
      for (const rawId of req.body.scheduledQuizIds) {
        const key = String(rawId);
        results[key] = {
          activityUserAnswers: answersByQuiz.get(key) || [],
          scheduledQuizUserStarts: startsByQuiz.get(key) || [],
        };
      }
      return res.status(GetLogsForScheduledQuizzesStatus.Retrieved).send({
        results,
        message: "Retrieved logs for scheduled quizzes.",
      });
    } catch (err: unknown) {
      logger.error(err);
      res.status(GetLogsForScheduledQuizzesStatus.InternalError).send({
        message:
          "Failed to retrieve log data for scheduled quizzes: an internal error occurred.",
      });
    }
  },
  getSurveyAnswersForScheduledQuiz: async function (
    req: Express.AuthenticatedRequest<{ scheduledQuizId: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message:
          "Failed to retrieve log data for scheduled quiz: teachers only.",
      });
    }
    if (!req.params.scheduledQuizId) {
      return res
        .status(GetSurveyAnswersForScheduledQuizStatus.MissingArguments)
        .send({
          message:
            "Failed to retrieve survey answers for scheduled quiz: missing quiz IDs.",
        });
    }

    // Rather than large switch, we use sets for O(1) lookups, as well as for more readable code.
    const ratingQuestions = new Set([
      "How difficult did you find the quiz?",
      "How would you assess your current level of understanding of the overall course?",
      "How much did you prepare for this week's lecture?",
      "How motivated were you to play this quiz?",
      "How sufficient did you find the time for playing this quiz?",
      "How much did the quiz lower your initial confidence in your understanding of the lecture's topics?",
      "How much did you restudy your lecture material after your last played quiz?",
      "How much did you adjust your studying to focus on the topics you found difficult in the previous quiz you played?",
      "How much had you already studied for your final written exam before this quiz?",
      "How much did this quiz improve your confidence for your upcoming final written exam?",
      "How useful did you find the dynamic difficulty adjustment of the quizzes?",
      "How beneficial was the BEACON Q app for your studies during this semester?",
      "How satisfied were you with the BEACON Q app experience?",
    ]);

    const yesNoQuestions = new Set([
      "Will you be restudying this quiz' topics before the next lecture?",
      "Will you be studying more for your final written exam based on your performance in this quiz?",
      "Did you find the scheduled nature of the quizzes too restrictive?",
      "Did the scheduling of the quizzes motivate you to play them in time?",
      "Did you often forget to check the BEACON Q app for new quizzes?",
    ]);

    try {
      const surveyAnswers = await SurveyAnswerModel.find({
        scheduledQuiz: new mongoose.Types.ObjectId(req.params.scheduledQuizId),
      })
        .populate("user", "username role")
        .lean()
        .exec();

      /// TODO: future version of SurveyAnswer schema should store this information.
      /// This is a temporary solution which is not safe.
      for (let surveyAnswer of surveyAnswers) {
        for (let answer of surveyAnswer.answers) {
          const question = answer.question.toString();
          if (ratingQuestions.has(question)) {
            answer.min = 1;
            answer.max = 5;
          } else if (yesNoQuestions.has(question)) {
            answer.isMultipleChoice = false;
            answer.choices = ["Yes", "No"];
          }
        }
      }

      return res.status(GetSurveyAnswersForScheduledQuizStatus.Retrieved).send({
        surveyAnswers: surveyAnswers,
        message: "Retrieved survey answers for scheduled quiz.",
      });
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(GetSurveyAnswersForScheduledQuizStatus.InternalError)
        .send({
          message:
            "Failed to retrieve survey answers for scheduled quiz: an internal error occurred.",
        });
    }
  },
  getTrialQuizAnswers: async function (
    req: Express.AuthenticatedRequest<{ courseId: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: "Failed to retrieve log data for trial quiz: teachers only.",
      });
    }
    if (!req.params.courseId) {
      return res.status(GetTrialQuizAnswersStatus.MissingArguments).send({
        message: "Failed to retrieve trial quiz answers: missing argument.",
      });
    }
    let courseId: mongoose.Types.ObjectId;
    try {
      courseId = new mongoose.Types.ObjectId(req.params.courseId);
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetTrialQuizAnswersStatus.MissingArguments).send({
        message:
          "Failed to retrieve trial quiz answers: missing argument. (ERR1)",
      });
    }
    try {
      const playContexts = await PlayContextModel.find({
        course: courseId,
        playType: "trialQuiz",
      })
        .select("contextId -_id")
        .lean()
        .exec();
      if (!playContexts || playContexts.length === 0) {
        return res.status(GetTrialQuizAnswersStatus.Retrieved).send({
          message: "No answers found for trial quiz.",
          answers: [],
        });
      }
      const playContextIds = playContexts.map((element) => element.contextId);
      const userAnswers = await ActivityUserAnswerModel.find({
        playContextId: { $in: playContextIds },
      })
        .lean()
        .exec();
      if (!userAnswers || userAnswers.length === 0) {
        res.status(GetTrialQuizAnswersStatus.Retrieved).send({
          message: "No answers found for trial quiz.",
          answers: [],
        });
        return;
      }
      const result = await ActivityUserAnswerModel.populate(userAnswers, [
        { path: "user", select: { username: 1, role: 1 } },
      ]);
      return res.status(GetTrialQuizAnswersStatus.Retrieved).send({
        message: "Answers found for trial quiz.",
        answers: result,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetTrialQuizAnswersStatus.InternalError).send({
        message: "An error occurred retrieving trial quiz answers. (ERR2)",
      });
    }
  },
  getActivityUserAnswers: async function (
    req: Express.AuthenticatedRequest<{ courseId: string }>,
    res: Response,
  ) {
    if (!req.params.courseId) {
      return res.status(GetActivityUserAnswersStatus.MissingArguments).send({
        message: "Failed to retrieve activity answers: missing argument.",
      });
    }
    let courseId: mongoose.Types.ObjectId;
    try {
      courseId = new mongoose.Types.ObjectId(req.params.courseId);
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetActivityUserAnswersStatus.MissingArguments).send({
        message:
          "Failed to retrieve activity answers: missing argument. (ERR1)",
      });
    }

    try {
      // Optimizations:
      // 1. Do the find and populate operations in a single call. Otherwise, you would have more round trips.
      // 2. Index the field 'courseContext'.
      // 3. Apply lean(): rather than Mongoose documents, this will return JavaScript objects.
      //    The advantage is that the additional overhead from Mongoose is eliminated, such as...
      //    - schema methods (save, validate, ...)
      //    - virtual properties
      //    - getters, setters
      // The third optimization also helps to significantly reduce the memory usage.
      const userAnswers = await ActivityUserAnswerModel.find({
        courseContext: courseId,
      })
        .populate("user", "username role")
        .lean()
        .exec();

      if (!userAnswers || userAnswers.length === 0) {
        return res.status(GetActivityUserAnswersStatus.Retrieved).send({
          message: "No answers found.",
          answers: [],
        });
      }
      // When we send the data to the client using res.send(...), userAnswers will automatically have JSON.stringify() applied to it.
      // In particular, because we used lean() earlier, this serialization will be much faster due to the plain JavaScript objects we're working with here.
      return res.status(GetActivityUserAnswersStatus.Retrieved).send({
        message: "Answers found.",
        answers: userAnswers,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetActivityUserAnswersStatus.InternalError).send({
        message: "An error occurred retrieving answers.",
      });
    }
  },
};

export default functions;
