const ActivityUserAnswer = require("../models/logs/activityUserAnswer");
const PlayContext = require("../models/logs/playContext");
const mongoose = require("mongoose");
const ScheduledQuizUserStart = require("../models/logs/scheduledQuizUserStart");
const SurveyAnswer = require("../models/logs/surveyAnswer");
const logger = require("../middleware/logger");

// Possible status codes
const GetLogsForScheduledQuizzesStatus = Object.freeze({
  Retrieved: 200,
  MissingArguments: 400,
  // InvalidScheduledQuizId: 452,
  // PlayPeriodOver: 455,
  // AlreadyPlayedAllActivities: 209,
  // NotYetAvailable: 210,
  InternalError: 500,
});
const GetSurveyAnswersForScheduledQuizStatus = Object.freeze({
  Retrieved: 200,
  MissingArguments: 400,
  InternalError: 500,
});
const GetTrialQuizAnswersStatus = Object.freeze({
  Retrieved: 200,
  MissingArguments: 400,
  InternalError: 500,
});
const GetActivityUserAnswersStatus = Object.freeze({
  Retrieved: 200,
  MissingArguments: 400,
  InternalError: 500,
});

var functions = {
  // Check status of scheduled quizzes
  getLogsForScheduledQuizzes: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message:
          "Failed to retrieve log data for scheduled quizzes: teachers only.",
      });
    }
    if (!req.body.scheduledQuizIds || req.body.scheduledQuizIds.length === 0) {
      return res
        .status(GetLogsForScheduledQuizzesStatus.MissingArguments)
        .send({
          message:
            "Failed to retrieve log data for scheduled quizzes: missing quiz IDs.",
        });
    }
    const scheduledQuizIds = [];
    for (const id of req.body.scheduledQuizIds) {
      try {
        scheduledQuizIds.push(mongoose.Types.ObjectId(id));
      } catch (_) {
        // We just skip invalid IDs
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
      const userAnswersPromise = ActivityUserAnswer.base
        .find({
          scheduledQuiz: {
            $in: scheduledQuizIds,
          },
        })
        .populate("user", "username role")
        .lean()
        .exec();
      // Promise 2
      const quizUserStartsPromise = ScheduledQuizUserStart.find({
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
    } catch (err) {
      logger.error(err);
      res.status(GetLogsForScheduledQuizzesStatus.InternalError).send({
        message:
          "Failed to retrieve log data for scheduled quizzes: an internal error occurred.",
      });
    }
  },
  getSurveyAnswersForScheduledQuiz: async function (req, res) {
    if (req.token.role !== "TEACHER") {
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
      const surveyAnswers = await SurveyAnswer.find({
        scheduledQuiz: mongoose.Types.ObjectId(req.params.scheduledQuizId),
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
    } catch (err) {
      logger.error(err);
      return res
        .status(GetSurveyAnswersForScheduledQuizStatus.InternalError)
        .send({
          message:
            "Failed to retrieve survey answers for scheduled quiz: an internal error occurred.",
        });
    }
  },
  getTrialQuizAnswers: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Failed to retrieve log data for trial quiz: teachers only.",
      });
    }
    if (!req.params.courseId) {
      return res.status(GetTrialQuizAnswersStatus.MissingArguments).send({
        message: "Failed to retrieve trial quiz answers: missing argument.",
      });
    }
    let courseId;
    try {
      courseId = mongoose.Types.ObjectId(req.params.courseId);
    } catch (err) {
      logger.error(err);
      return res.status(GetTrialQuizAnswersStatus.MissingArguments).send({
        message:
          "Failed to retrieve trial quiz answers: missing argument. (ERR1)",
      });
    }
    try {
      const playContexts = await PlayContext.find({
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
      const userAnswers = await ActivityUserAnswer.base
        .find({ playContextId: { $in: playContextIds } })
        .lean()
        .exec();
      if (!userAnswers || userAnswers.length === 0) {
        res.status(GetTrialQuizAnswersStatus.Retrieved).send({
          message: "No answers found for trial quiz.",
          answers: [],
        });
        return;
      }
      const result = await ActivityUserAnswer.base.populate(userAnswers, [
        { path: "user", select: { username: 1, role: 1 } },
      ]);
      return res.status(GetTrialQuizAnswersStatus.Retrieved).send({
        message: "Answers found for trial quiz.",
        answers: result,
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetTrialQuizAnswersStatus.InternalError).send({
        message: "An error occurred retrieving trial quiz answers. (ERR2)",
      });
    }
  },
  getActivityUserAnswers: async function (req, res) {
    if (!req.params.courseId) {
      res.status(GetActivityUserAnswersStatus.MissingArguments).send({
        message: "Failed to retrieve activity answers: missing argument.",
      });
      return;
    }
    let courseId;
    try {
      courseId = mongoose.Types.ObjectId(req.params.courseId);
    } catch (err) {
      logger.error(err);
      res.status(GetActivityUserAnswersStatus.MissingArguments).send({
        message:
          "Failed to retrieve activity answers: missing argument. (ERR1)",
      });
      return;
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
      const userAnswers = await ActivityUserAnswer.base
        .find({ courseContext: courseId })
        .populate("user", "username role")
        .lean()
        .exec();

      if (!userAnswers || userAnswers.length === 0) {
        res.status(GetActivityUserAnswersStatus.Retrieved).send({
          message: "No answers found.",
          answers: [],
        });
        return;
      }
      // When we send the data to the client using res.send(...), userAnswers will automatically have JSON.stringify() applied to it.
      // In particular, because we used lean() earlier, this serialization will be much faster due to the plain JavaScript objects we're working with here.
      res.status(GetActivityUserAnswersStatus.Retrieved).send({
        message: "Answers found.",
        answers: userAnswers,
      });
    } catch (err) {
      logger.error(err);
      res.status(GetActivityUserAnswersStatus.InternalError).send({
        message: "An error occurred retrieving answers.",
      });
    }
  },
};

module.exports = functions;
