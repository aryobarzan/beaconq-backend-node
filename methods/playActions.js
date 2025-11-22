var ActivityUserAnswer = require("../models/logs/activityUserAnswer");
var Quiz = require("../models/quiz");
var mongoose = require("mongoose");
var ScheduledQuizUserStart = require("../models/logs/scheduledQuizUserStart");
var ModelHelper = require("../middleware/modelHelper");
const { DateTime } = require("luxon");
const SurveyAnswer = require("../models/logs/surveyAnswer");
const logger = require("../middleware/logger");
const SurveyHelper = require("../middleware/surveyHelper");
const ActivityUserInteraction = require("../models/logs/activityUserInteraction");
const AppInteractionLog = require("../models/logs/appInteractionLog");
const AppUserInteractionLog = require("../models/logs/appUserInteractionLog");
const PlayContext = require("../models/logs/playContext");
const Course = require("../models/course");

// Possible status codes
const ScheduledQuizStatus = Object.freeze({
  CanStart: 0,
  CanContinue: 1,
  HasFinished: 2,
  IsOver: 3,
  NotAvailable: 4,
});
const CheckScheduledQuizzesStatus = Object.freeze({
  Retrieved: 200,
  NoRegisteredCourses: 209,
  InternalError: 500,
});
const PlayScheduledQuizStatus = Object.freeze({
  CanPlay: 200,
  MissingArguments: 400,
  InvalidScheduledQuizId: 452,
  PlayPeriodOver: 455,
  AlreadyPlayedAllActivities: 209,
  NotYetAvailable: 210,
  InternalError: 500,
});
const CheckScheduledQuizSurveyStatus = Object.freeze({
  Available: 200,
  AlreadyTaken: 209,
  MissingArguments: 400,
  InvalidScheduledQuizId: 452,
  PlayPeriodOver: 455,
  InternalError: 500,
});
const LogActivityUserAnswerStatus = Object.freeze({
  Logged: 200,
  AlreadyLogged: 209,
  MissingArguments: 400,
  InvalidScheduledQuizId: 452,
  InvalidActivityUserAnswer: 455,
  InternalError: 500,
});
const LogActivityUserAnswersStatus = Object.freeze({
  Logged: 200,
  NothingToLog: 452,
  MissingArguments: 400,
  InternalError: 500,
});
const LogActivityFeedbackViewStatus = Object.freeze({
  Logged: 200,
  Incremented: 209,
  MissingArguments: 400,
  InvalidScheduledQuizId: 452,
  InvalidActivityFeedbackView: 454,
  InternalError: 500,
});
const LogActivityUserInteractionStatus = Object.freeze({
  Logged: 200,
  MissingArguments: 400,
  InvalidActivityUserInteraction: 452,
  InternalError: 500,
});
const LogAppInteractionStatus = Object.freeze({
  Logged: 200,
  MissingArguments: 400,
  Invalid: 452,
  InternalError: 500,
});
const LogAppUserInteractionStatus = Object.freeze({
  Logged: 200,
  MissingArguments: 400,
  Invalid: 452,
  InternalError: 500,
});
const LogSurveyAnswerStatus = Object.freeze({
  Logged: 200,
  AlreadyLogged: 209,
  MissingArguments: 400,
  InvalidSurveyAnswer: 452,
  InternalError: 500,
});
const LogPlayContext = Object.freeze({
  Logged: 200,
  Updated: 209,
  MissingArguments: 400,
  InternalError: 500,
});
const TrialQuizPlayStatusCode = Object.freeze({
  Played: 200,
  NotPlayed: 209,
  NoTrialQuiz: 210,
  MissingArguments: 400,
  InternalError: 500,
});
async function saveActivityUserAnswer(activityUserAnswer) {
  try {
    // Rather than using a separate findOne followed by save(), rely solely on save().
    // This helps to avoid a race condition in between those two separate queries/operations.
    // Here, save() works on its own thanks to our unique indexes on the ActivityUserAnswer schema.
    const savedActivityUserAnswer = await activityUserAnswer.save();
    return [
      LogActivityUserAnswerStatus.Logged,
      "The user's activity answer has been logged.",
      savedActivityUserAnswer,
    ];
  } catch (err) {
    // If the DuplicateKey error is thrown by the save(), indicate that the answer has already been logged.
    if (err && (err.code === 11000 || err.codeName === "DuplicateKey")) {
      return [
        LogActivityUserAnswerStatus.AlreadyLogged,
        "Failed to save user activity answer: it is already logged.",
        null,
      ];
    }
    logger.warn(err);
    return [
      LogActivityUserAnswerStatus.InternalError,
      "Failed to save user activity answer: an error occurred while saving.",
      null,
    ];
  }
}

async function checkScheduledQuizUserStatus(
  scheduledQuizId,
  userId,
  excludeOld,
) {
  try {
    const scheduledQuiz = await ModelHelper.findScheduledQuiz(scheduledQuizId);
    if (!scheduledQuiz) {
      return {
        err: new Error("Scheduled quiz does not exist."),
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId: null,
      };
    }
    const quiz = await Quiz.findById(scheduledQuiz.quiz).lean().exec();
    if (!quiz) {
      return {
        err: new Error("Quiz does not exist."),
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }

    const possibleActivities = (quiz.activities || []).map((e) => e.toString());

    // Ensure dateTime fields exist
    if (!scheduledQuiz.startDateTime || !scheduledQuiz.endDateTime) {
      logger.warn("Scheduled quiz missing start/end date", { scheduledQuizId });
      return {
        err: new Error("Scheduled quiz missing scheduling dates."),
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }

    const currentDate = DateTime.now().setZone("utc");
    const scheduledQuizStartDateTime = DateTime.fromJSDate(
      scheduledQuiz.startDateTime,
      { zone: "utc" },
    );
    const scheduledQuizEndDateTime = DateTime.fromJSDate(
      scheduledQuiz.endDateTime,
      { zone: "utc" },
    );

    // If it's an older scheduled quiz which has expired, don't analyze it and just return null.
    // This is an optimization measure.
    if (
      excludeOld &&
      currentDate > scheduledQuizEndDateTime &&
      currentDate.diff(scheduledQuizEndDateTime, "months").as("months") > 4
    ) {
      return {
        isOld: true,
        err: null,
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }

    if (currentDate < scheduledQuizStartDateTime) {
      return {
        err: null,
        quizStatus: ScheduledQuizStatus.NotAvailable,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }

    const isWithinPlayPeriod =
      scheduledQuizStartDateTime <= currentDate &&
      scheduledQuizEndDateTime > currentDate;

    // Fetch in parallel:
    // 1. The user's existing answers to the scheduled quiz (only retain 'activity' field to reduce memory usage)
    // 2. The user's ScheduledQuizUserStart record for the scheduled quiz
    // Fetch user's answers (only 'activity') and start record in parallel.
    // Project 'activity' and use lean() to reduce overhead.
    const [activityUserAnswers, scheduledQuizUserStart] = await Promise.all([
      ActivityUserAnswer.base
        .find(
          { scheduledQuiz: scheduledQuiz._id, user: userId },
          "activity -_id",
        )
        .lean()
        .exec(),
      ScheduledQuizUserStart.findOne({
        scheduledQuiz: scheduledQuiz._id,
        user: userId,
      })
        .lean()
        .exec(),
    ]);
    // Use set for O(1) lookups when using has(...)
    const playedActivitiesSet = new Set(
      (activityUserAnswers || []).map((e) => e.activity.toString()),
    );

    const availableActivities = possibleActivities.filter(
      (activityId) => !playedActivitiesSet.has(activityId),
    );

    // Has not started the scheduled quiz yet
    if (!scheduledQuizUserStart) {
      // Dart Client expects remaining time in microseconds

      // Can still start quiz
      if (isWithinPlayPeriod) {
        return {
          err: null,
          quizStatus: ScheduledQuizStatus.CanStart,
          availableActivities: possibleActivities,
          availablePlayTime: scheduledQuiz.playDuration || null,
          availableSurveyQuestions: null,
          scheduledQuizId,
        };
      } else {
        return {
          err: null,
          quizStatus: ScheduledQuizStatus.IsOver,
          availableActivities: null,
          availablePlayTime: null,
          availableSurveyQuestions: null,
          scheduledQuizId,
        };
      }
    }

    // The user has started the scheduled quiz: compute remaining play time
    // Note: scheduledQuiz.playDuration is in microseconds
    const scheduledQuizStartDate = DateTime.fromJSDate(
      scheduledQuizUserStart.serverTimestamp,
      { zone: "utc" },
    );

    const playDurationMicro = scheduledQuiz.playDuration || 0;
    const playDurationSeconds = playDurationMicro / 1_000_000;

    const elapsedSeconds = currentDate
      .diff(scheduledQuizStartDate, "seconds")
      .as("seconds");
    let remainingSeconds = playDurationSeconds - elapsedSeconds;

    // Ensure a minimum value of 0
    if (!Number.isFinite(remainingSeconds)) remainingSeconds = 0;

    const hasFinished =
      !Array.isArray(availableActivities) || availableActivities.length === 0;
    const hasRunOutOfTime = remainingSeconds <= 0;

    // Check survey status
    const surveyStatus = await SurveyHelper.checkScheduledQuizSurveyUserStatus(
      userId,
      scheduledQuiz,
      Array.from(playedActivitiesSet),
      availableActivities,
    );

    if (!surveyStatus) {
      return {
        err: new Error("Survey status could not be checked."),
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }
    if (surveyStatus.err) {
      return {
        err: surveyStatus.err,
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }

    // After finishing the scheduled quiz, give the user up to 1 additional day to answer the survey questions associated with the scheduled quiz.
    const canNoLongerTakeSurvey =
      !isWithinPlayPeriod &&
      currentDate.diff(scheduledQuizEndDateTime, "days").as("days") > 1;
    if (canNoLongerTakeSurvey) {
      surveyStatus.questions = null;
    }

    if (hasFinished) {
      return {
        err: null,
        quizStatus: ScheduledQuizStatus.HasFinished,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: surveyStatus.questions,
        scheduledQuizId,
      };
    } else if (hasRunOutOfTime) {
      // Had started playing, but play time has expired and can no longer continue
      return {
        err: null,
        quizStatus: ScheduledQuizStatus.HasFinished,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: surveyStatus.questions,
        scheduledQuizId,
      };
    } else if (isWithinPlayPeriod) {
      // Has not finished playing and can continue playing
      return {
        err: null,
        quizStatus: ScheduledQuizStatus.CanContinue,
        availableActivities,
        availablePlayTime: Math.max(
          0,
          parseInt(remainingSeconds * 1_000_000, 10),
        ),
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    } else {
      // Play period is over but user still has unplayed activities (outside play window)
      return {
        err: null,
        quizStatus: ScheduledQuizStatus.HasFinished,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: surveyStatus.questions,
        scheduledQuizId,
      };
    }
  } catch (err) {
    logger.error(err);
    return {
      err,
      quizStatus: null,
      availableActivities: null,
      availablePlayTime: null,
      availableSurveyQuestions: null,
      scheduledQuizId: scheduledQuizId || null,
    };
  }
}

async function checkScheduledQuizzesUserStatus(coursesRaw, userId) {
  const courses = Array.isArray(coursesRaw) ? coursesRaw : [coursesRaw];
  const courseStatuses = {};
  // we process the status of a course's scheduled quizzes in batches to avoid
  // overwhelming the database with too many queries in parallel by limiting the concurrency.
  async function mapInBatches(items, fn, batchSize = 20) {
    const output = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const promises = batch.map((item) => fn(item));
      // we use Promise.allSettled instead of Promise.all: this ensures that the entire process does not get rejected
      // from a single promise failing (rejecting).
      // In this approach, even if checking the status of one scheduled quiz fails, the status of the others would still
      // be returned. The failed promises would also be retained, albeit with the status "rejected" instead of "fulfilled".
      const settledPromises = await Promise.allSettled(promises);
      output.push(...settledPromises);
    }
    return output;
  }

  for (let course of courses) {
    const statuses = {};
    try {
      const scheduledQuizzes = course.getScheduledQuizzes() || [];
      if (!scheduledQuizzes || scheduledQuizzes.length === 0) {
        courseStatuses[course._id] = statuses;
        continue;
      }

      const settledPromises = await mapInBatches(scheduledQuizzes, (sq) =>
        checkScheduledQuizUserStatus(sq._id, userId, true)
          .then((res) => ({ scheduledQuizId: sq._id, ok: true, res }))
          .catch((err) => ({ scheduledQuizId: sq._id, ok: false, err })),
      );

      for (let i = 0; i < settledPromises.length; i++) {
        const item = settledPromises[i];
        const expectedSq = scheduledQuizzes[i];
        if (item.status === "fulfilled") {
          const payload = item.value;
          // Payload is { scheduledQuizId, ok: true, res }
          // In case of error: { scheduledQuizId, ok: false, err }
          if (
            payload &&
            payload.ok &&
            payload.res &&
            payload.res.scheduledQuizId
          ) {
            statuses[payload.res.scheduledQuizId] = payload.res;
          } else if (payload && payload.res && payload.res.isOld) {
            // skip old scheduled quizzes
          } else {
            // Unexpected payload shape
            logger.error("Unexpected scheduled quiz status payload", {
              scheduledQuizId: expectedSq._id,
              payload,
            });
          }
        } else {
          // promise rejected: log with scheduledQuiz id and continue
          logger.error("Failed to check scheduled quiz status", {
            scheduledQuizId: expectedSq._id,
            err: item.reason,
          });
        }
      }

      courseStatuses[course._id] = statuses;
    } catch (err) {
      logger.error("Error checking scheduled quizzes for course", {
        courseId: course._id,
        err,
      });
      courseStatuses[course._id] = {};
    }
  }

  return courseStatuses;
}

var functions = {
  // Check status of all scheduled quizzes from the user's registered courses
  checkScheduledQuizzes: async function (req, res) {
    try {
      const registeredCourses = await ModelHelper.getUserRegisteredCourses(
        req.token._id,
      );
      if (!registeredCourses) {
        return res
          .status(CheckScheduledQuizzesStatus.NoRegisteredCourses)
          .send({
            message:
              "Can't check scheduled quiz status: user has no registered courses.",
          });
      }

      const statuses = await checkScheduledQuizzesUserStatus(
        registeredCourses,
        req.token._id,
      );
      if (!statuses) {
        return res.status(CheckScheduledQuizzesStatus.InternalError).send({
          message: "Can't check scheduled quiz status: internal error.",
        });
      }

      // Return the statuses object directly (not stringified) for easier consumption by clients
      return res.status(CheckScheduledQuizzesStatus.Retrieved).send({
        message: "Retrieved scheduled quiz statuses.",
        statuses: JSON.stringify(statuses),
      });
    } catch (err) {
      logger.error(err);
      return res.status(CheckScheduledQuizzesStatus.InternalError).send({
        message: "Can't check scheduled quiz status: internal error.",
      });
    }
  },
  checkTrialQuizPlayStatus: async function (req, res) {
    if (!req.params.courseId) {
      return res.status(TrialQuizPlayStatusCode.MissingArguments).send({
        message: "Can't check trial quiz play status: missing arguments.",
      });
    }

    const rawCourseId = req.params.courseId;
    if (!mongoose.isValidObjectId(rawCourseId)) {
      logger.error("Invalid courseId for trial quiz check", {
        courseId: rawCourseId,
      });
      return res.status(TrialQuizPlayStatusCode.MissingArguments).send({
        message: "Can't check trial quiz play status: missing argument. (ERR1)",
      });
    }

    const courseId = mongoose.Types.ObjectId(rawCourseId);

    try {
      // We just select (retain) the trialQuiz field which we need.
      const course = await Course.findById(courseId, "trialQuiz").lean().exec();
      if (!course) {
        logger.error(
          "Failed to find course to check its trial quiz play status",
          { courseId: rawCourseId },
        );
        return res.status(TrialQuizPlayStatusCode.InternalError).send({
          message: "Failed to check trial quiz play status. (ERR12)",
        });
      }

      if (!course.trialQuiz) {
        return res.status(TrialQuizPlayStatusCode.NoTrialQuiz).send({
          message: "There is no trial quiz for this course.",
        });
      }

      // Only fetch the fields contextId and activities to compute unique activity ids
      const playContexts = await PlayContext.find(
        { user: req.token._id, course: courseId, playType: "trialQuiz" },
        "contextId activities",
      )
        .lean()
        .exec();

      if (!playContexts || playContexts.length === 0) {
        return res.status(TrialQuizPlayStatusCode.NotPlayed).send({
          message:
            "The user has not yet played the trial quiz for this course.",
        });
      }

      // Collect unique activity ids across all play contexts
      const contextIds = playContexts.map((p) => p.contextId);
      const uniqueActivityIdsSet = new Set();
      for (const p of playContexts) {
        if (Array.isArray(p.activities)) {
          for (const a of p.activities) {
            uniqueActivityIdsSet.add(a.toString());
          }
        }
      }
      const uniqueActivityIds = Array.from(uniqueActivityIdsSet);

      if (uniqueActivityIds.length === 0) {
        // Nothing to play (this case should normally never occur)
        res.status(TrialQuizPlayStatusCode.NotPlayed).send({
          message:
            "The user has not yet played the trial quiz for this course.",
        });
        return;
      }

      // Get the distinct activities the user has answered during those play contexts.
      const answeredActivityIds = await ActivityUserAnswer.base.distinct(
        "activity",
        {
          user: req.token._id,
          playContextId: { $in: contextIds },
        },
      );

      const answeredSet = new Set(
        (answeredActivityIds || []).map((x) => x.toString()),
      );
      if (answeredSet.size >= uniqueActivityIds.length) {
        return res.status(TrialQuizPlayStatusCode.Played).send({
          message: "The user has played the trial quiz for this course.",
        });
      }

      // Return remaining activity ids which have not been answered yet
      const remainingActivityIds = uniqueActivityIds.filter(
        (aid) => !answeredSet.has(aid),
      );
      return res.status(TrialQuizPlayStatusCode.NotPlayed).send({
        message:
          "The user has not yet fully played the trial quiz for this course.",
        remainingActivities: remainingActivityIds,
      });
    } catch (err) {
      logger.error("Error while checking trial quiz play status", {
        courseId: rawCourseId,
        err,
      });
      return res.status(TrialQuizPlayStatusCode.InternalError).send({
        message: "Failed to check trial quiz play status. (ERR2)",
      });
    }
  },
  playScheduledQuiz: async function (req, res) {
    if (!req.body.scheduledQuizId || !req.body.timestamp) {
      logger.warn("Can't play scheduled quiz: missing arguments.");
      return res
        .status(PlayScheduledQuizStatus.MissingArguments)
        .send({ message: "Can't play scheduled quiz: missing arguments." });
    }

    const rawScheduledQuizId = req.body.scheduledQuizId;
    if (!mongoose.isValidObjectId(rawScheduledQuizId)) {
      logger.error("Invalid scheduledQuizId for playScheduledQuiz", {
        scheduledQuizId: rawScheduledQuizId,
      });
      return res.status(PlayScheduledQuizStatus.MissingArguments).send({
        message:
          "Can't play scheduled quiz: specified scheduled quiz id is not the right type.",
      });
    }

    try {
      const status = await checkScheduledQuizUserStatus(
        rawScheduledQuizId,
        req.token._id,
        false,
      );

      if (!status || status.err) {
        logger.error("Failed to check scheduled quiz status before play", {
          scheduledQuizId: rawScheduledQuizId,
          err: status ? status.err : null,
        });
        return res.status(PlayScheduledQuizStatus.InternalError).send({
          message: "Can't play scheduled quiz: internal error occurred.",
        });
      }

      switch (status.quizStatus) {
        case ScheduledQuizStatus.CanStart: {
          // we use a session/transaction to atomically ensure only a single ScheduledQuizUserStart is created
          const session = await mongoose.startSession();
          let savedScheduledQuizUserStart = null;
          try {
            await session.withTransaction(async () => {
              // we re-check inside the transaction whether a ScheduledQuizUserStart already exists
              const existingScheduledQuizUserStart =
                await ScheduledQuizUserStart.findOne(
                  { scheduledQuiz: rawScheduledQuizId, user: req.token._id },
                  null,
                  { session },
                ).exec();

              if (existingScheduledQuizUserStart) {
                savedScheduledQuizUserStart = null;
                return;
              }

              // Create and save the start in-transaction so any schema middleware runs
              const scheduledQuizUserStart = new ScheduledQuizUserStart({
                scheduledQuiz: rawScheduledQuizId,
                timestamp: req.body.timestamp,
                user: req.token._id,
              });

              // pass session to save()
              savedScheduledQuizUserStart = await scheduledQuizUserStart.save({
                session,
              });
            });

            // Ideally we should recompute the status to ensure availableActivities and availablePlayTime are up-to-date., though this is not critical.
            const finalStatus = await checkScheduledQuizUserStatus(
              rawScheduledQuizId,
              req.token._id,
              false,
            );

            return res.status(PlayScheduledQuizStatus.CanPlay).send({
              status: status.quizStatus,
              activities: status.availableActivities,
              availablePlayTime: status.availablePlayTime,
            });
          } catch (err) {
            logger.error(
              "Transaction failed while creating ScheduledQuizUserStart",
              {
                scheduledQuizId: rawScheduledQuizId,
                err: err,
              },
            );
            return res.status(PlayScheduledQuizStatus.InternalError).send({
              message: "Can't play scheduled quiz: internal error occurred.",
            });
          } finally {
            session.endSession();
          }
        }

        case ScheduledQuizStatus.CanContinue:
          return res.status(PlayScheduledQuizStatus.CanPlay).send({
            status: status.quizStatus,
            activities: status.availableActivities,
            availablePlayTime: status.availablePlayTime,
            availableSurveyQuestions: status.availableSurveyQuestions,
          });

        case ScheduledQuizStatus.HasFinished:
          return res
            .status(PlayScheduledQuizStatus.AlreadyPlayedAllActivities)
            .send({
              status: status.quizStatus,
              availableSurveyQuestions: status.availableSurveyQuestions,
              message:
                "Can't play scheduled quiz: the user has already played all the contained activities.",
            });

        case ScheduledQuizStatus.IsOver:
          return res.status(PlayScheduledQuizStatus.PlayPeriodOver).send({
            status: status.quizStatus,
            availableSurveyQuestions: status.availableSurveyQuestions,
            message: "Can't play scheduled quiz: the play period is over.",
          });

        case ScheduledQuizStatus.NotAvailable:
          return res.status(PlayScheduledQuizStatus.NotYetAvailable).send({
            status: status.quizStatus,
            availableSurveyQuestions: status.availableSurveyQuestions,
            message:
              "Can't play scheduled quiz: the quiz period hasn't started yet.",
          });

        default:
          return res.status(PlayScheduledQuizStatus.InternalError).send({
            message: "Can't play scheduled quiz: an internal error occurred.",
          });
      }
    } catch (err) {
      logger.error("Unhandled error in playScheduledQuiz", {
        scheduledQuizId: rawScheduledQuizId,
        err,
      });
      return res.status(PlayScheduledQuizStatus.InternalError).send({
        message: "Can't play scheduled quiz: internal error occurred.",
      });
    }
  },
  checkScheduledQuizSurveyStatus: async function (req, res) {
    if (!req.params.scheduledQuizId) {
      logger.warn("Can't check survey status: missing arguments.");
      return res
        .status(CheckScheduledQuizSurveyStatus.MissingArguments)
        .send({ message: "Can't check survey status: missing arguments." });
    }
    if (!mongoose.isValidObjectId(req.params.scheduledQuizId)) {
      return res.status(CheckScheduledQuizSurveyStatus.MissingArguments).send({
        message:
          "Can't check survey status: specified scheduled quiz id is not the right type.",
      });
    }
    try {
      const scheduledQuiz = await ModelHelper.findScheduledQuiz(
        req.params.scheduledQuizId,
      );
      const surveyStatus =
        await SurveyHelper.checkScheduledQuizSurveyUserStatus(
          req.token._id,
          scheduledQuiz,
        );
      if (!surveyStatus) {
        return res.status(CheckScheduledQuizSurveyStatus.InternalError).send({
          message: "Can't check survey status: an error occurred.",
        });
      }
      if (surveyStatus.existingSurveyAnswer) {
        return res.status(CheckScheduledQuizSurveyStatus.AlreadyTaken).send({
          message:
            "The user has already taken the survey for this scheduled quiz.",
        });
      } else if (surveyStatus.questions) {
        return res.status(CheckScheduledQuizSurveyStatus.Available).send({
          message: "The user can take a survey for this scheduled quiz.",
          availableSurveyQuestions: surveyStatus.questions,
        });
      } else {
        return res.status(CheckScheduledQuizSurveyStatus.PlayPeriodOver).send({
          message:
            "The user can no longer take a survey for this scheduled quiz.",
        });
      }
    } catch (err) {
      logger.error(err);
      return res.status(CheckScheduledQuizSurveyStatus.InternalError).send({
        message: "Can't check survey status: an error occurred.",
      });
    }
  },
  logActivityUserAnswer: async function (req, res) {
    if (!req.body || !req.body.activityUserAnswer) {
      logger.warn("Activity answer logging failed: missing arguments.");
      return res.status(LogActivityUserAnswerStatus.MissingArguments).send({
        message: "Activity answer logging failed: missing arguments.",
      });
    }

    let decodedActivityUserAnswer;
    try {
      decodedActivityUserAnswer = ModelHelper.decodeActivityUserAnswer(
        JSON.parse(req.body.activityUserAnswer),
      );
    } catch (err) {
      logger.warn("Failed to parse activityUserAnswer payload", { err });
      return res
        .status(LogActivityUserAnswerStatus.InvalidActivityUserAnswer)
        .send({
          message:
            "Activity answer logging failed: activity user answer could not be deserialized.",
        });
    }

    if (!decodedActivityUserAnswer) {
      return res
        .status(LogActivityUserAnswerStatus.InvalidActivityUserAnswer)
        .send({
          message:
            "Activity answer logging failed: activity user answer could not be deserialized.",
        });
    }

    // Attach user ID from token
    decodedActivityUserAnswer.user = req.token?._id;

    // Answered activity in the context of a scheduled quiz
    if (decodedActivityUserAnswer.scheduledQuiz) {
      if (!mongoose.isValidObjectId(decodedActivityUserAnswer.scheduledQuiz)) {
        logger.warn("Invalid scheduledQuiz id in activity answer", {
          scheduledQuiz: decodedActivityUserAnswer.scheduledQuiz,
        });
        return res
          .status(LogActivityUserAnswerStatus.InvalidScheduledQuizId)
          .send({
            message:
              "Activity answer logging failed: specified scheduled quiz id is not the right type.",
          });
      }
      try {
        const scheduledQuiz = await ModelHelper.findScheduledQuiz(
          decodedActivityUserAnswer.scheduledQuiz,
        );
        if (!scheduledQuiz) {
          return res
            .status(LogActivityUserAnswerStatus.InvalidScheduledQuizId)
            .send({
              message:
                "Activity answer logging failed: specified scheduled quiz could not be found.",
            });
        }
        decodedActivityUserAnswer.scheduledQuiz = scheduledQuiz._id;
      } catch (err) {
        logger.error(
          "Error while validating scheduled quiz for activity answer",
          { err },
        );
        return res
          .status(LogActivityUserAnswerStatus.InvalidScheduledQuizId)
          .send({
            message:
              "Activity answer logging failed: failed to find scheduled quiz with indicated ID. (error)",
          });
      }
    }

    try {
      // saveActivityUserAnswer() handles duplicates, so no need for extra checks here.
      const [statusCode, message, savedActivityUserAnswer] =
        await saveActivityUserAnswer(decodedActivityUserAnswer);
      return res.status(statusCode).send({
        message,
        activityUserAnswer: savedActivityUserAnswer || null,
      });
    } catch (err) {
      logger.error("Unexpected error in logActivityUserAnswer", { err });
      return res.status(LogActivityUserAnswerStatus.InternalError).send({
        message:
          "Activity answer logging failed: an internal error occurred while saving.",
      });
    }
  },
  logActivityUserAnswers: async function (req, res) {
    if (!req.body.activityUserAnswers) {
      logger.warn("Activity answers logging failed: missing arguments.");
      return res.status(LogActivityUserAnswersStatus.MissingArguments).send({
        message: "Activity answers logging failed: missing arguments.",
      });
    }

    let rawAnswersArray;
    try {
      rawAnswersArray = JSON.parse(req.body.activityUserAnswers);
    } catch (err) {
      logger.warn("Failed to parse activityUserAnswers payload", { err });
      return res.status(LogActivityUserAnswersStatus.MissingArguments).send({
        message: "Activity answers logging failed: invalid payload.",
      });
    }

    const activityUserAnswers = [];
    for (const rawAnswer of rawAnswersArray) {
      const decoded = ModelHelper.decodeActivityUserAnswer(rawAnswer);
      if (decoded) {
        decoded.user = req.token._id;
        activityUserAnswers.push(decoded);
      } else {
        logger.warn("Failed to decode activity user answer", { rawAnswer });
      }
    }

    if (activityUserAnswers.length === 0) {
      return res.status(LogActivityUserAnswersStatus.NothingToLog).send({
        message:
          "Activity answers logging failed: activity user answers could not be deserialized.",
      });
    }

    // TODO (?): also validate scheduledQuiz field to be consistent with the single-insert endpoint logActivityUserAnswer().

    // // Ensure we have Mongoose document instances so save(...) exists.
    //     const activityUserAnswerDocs = activityUserAnswers.map((a) =>
    //       a && typeof a.save === "function" ? a : new ActivityUserAnswer.base(a),
    //     );
    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      logger.error("Failed to start MongoDB session for transactional batch", {
        err,
      });
      return res.status(LogActivityUserAnswersStatus.InternalError).send({
        message: "Failed to log activity answers: could not start DB session.",
      });
    }

    try {
      let insertedCount = 0;
      const alreadyLoggedAnswerTimestamps = [];

      await session.withTransaction(async () => {
        for (const activityUserAnswer of activityUserAnswers) {
          try {
            await activityUserAnswer.save({ session });
            insertedCount += 1;
          } catch (err) {
            // Duplicate key: already logged
            if (
              err &&
              (err.code === 11000 || err.codeName === "DuplicateKey")
            ) {
              alreadyLoggedAnswerTimestamps.push(activityUserAnswer.timestamp);
              continue;
            }
            // Any other error should abort the transaction
            logger.error("Error saving activity answer inside transaction", {
              err,
            });
            throw err;
          }
        }
      });

      return res.status(LogActivityUserAnswersStatus.Logged).send({
        message: "Activity answers logged.",
        insertedCount,
        alreadyLoggedAnswerTimestamps,
      });
    } catch (err) {
      logger.error("Failed to log activity answers.", { err });
      return res.status(LogActivityUserAnswersStatus.InternalError).send({
        message: "Failed to log activity answers.",
      });
    } finally {
      if (session) session.endSession();
    }
  },
  logActivityFeedbackView: async function (req, res) {
    if (!req.body.activityFeedbackView) {
      return res.status(LogActivityFeedbackViewStatus.MissingArguments).send({
        message: "Activity feedback view logging failed: missing parameter(s).",
      });
    }
    const activityFeedbackView = ModelHelper.decodeActivityFeedbackView(
      JSON.parse(req.body.activityFeedbackView),
    );
    if (!activityFeedbackView) {
      return res
        .status(LogActivityFeedbackViewStatus.InvalidActivityFeedbackView)
        .send({
          message:
            "Activity feedback view logging failed: could not be deserialized.",
        });
    }
    activityFeedbackView.user = req.token._id;
    try {
      let saved = await activityFeedbackView.save();
      if (!saved) {
        return res.status(LogActivityFeedbackViewStatus.InternalError).send({
          message: "Activity feedback view logging failed: failed to save.",
        });
      }
      return res
        .status(LogActivityFeedbackViewStatus.Logged)
        .send({ message: "Activity feedback view logged." });
    } catch (err) {
      logger.error(err);
      return res.status(LogActivityFeedbackViewStatus.InternalError).send({
        message:
          "Activity feedback view logging failed: failed to save. (error)",
      });
    }
  },
  logActivityUserInteraction: async function (req, res) {
    if (!req.body.activityUserInteraction) {
      return res
        .status(LogActivityUserInteractionStatus.MissingArguments)
        .send({
          message:
            "Activity user interaction logging failed: missing parameter.",
        });
    }

    let activityUserInteraction;
    try {
      activityUserInteraction = ModelHelper.decodeActivityUserInteraction(
        JSON.parse(req.body.activityUserInteraction),
      );
    } catch (err) {
      logger.warn("Failed to parse activityUserInteraction payload", { err });
      return res
        .status(LogActivityUserInteractionStatus.InvalidActivityUserInteraction)
        .send({
          message: "Activity user interaction logging failed: invalid payload.",
        });
    }

    if (!activityUserInteraction) {
      return res
        .status(LogActivityUserInteractionStatus.InvalidActivityUserInteraction)
        .send({
          message:
            "Activity user interaction logging failed: could not be deserialized.",
        });
    }

    activityUserInteraction.user = req.token._id;

    if (
      !activityUserInteraction.activity ||
      !activityUserInteraction.timestamp
    ) {
      return res
        .status(LogActivityUserInteractionStatus.MissingArguments)
        .send({
          message:
            "Activity user interaction logging failed: missing activity or timestamp.",
        });
    }
    // Enforce max content length
    if (
      activityUserInteraction.content &&
      activityUserInteraction.content.length > 5000
    ) {
      return res
        .status(LogActivityUserInteractionStatus.InvalidActivityUserInteraction)
        .send({
          message:
            "Activity user interaction logging failed: content too long.",
        });
    }

    try {
      const saved = await activityUserInteraction.save();
      if (!saved) {
        return res.status(LogActivityUserInteractionStatus.InternalError).send({
          message: "Activity user interaction logging failed: failed to save.",
        });
      }
      return res.status(LogActivityUserInteractionStatus.Logged).send({
        message: "Activity user interaction logged.",
      });
    } catch (err) {
      // Duplicate key: already logged
      if (err && (err.code === 11000 || err.codeName === "DuplicateKey")) {
        return res.status(LogActivityUserInteractionStatus.Logged).send({
          message: "Activity user interaction is already logged.",
        });
      }
      logger.error("Failed to save activityUserInteraction", { err });
      return res.status(LogActivityUserInteractionStatus.InternalError).send({
        message:
          "Activity user interaction logging failed: failed to save. (error)",
      });
    }
  },
  // DEPRECATED: replaced with logAppUserInteraction.
  // This old endpoint is retained for compatibility with older client versions.
  logAppInteraction: async function (req, res) {
    if (!req.body.appInteractionLog) {
      return res.status(LogAppInteractionStatus.MissingArguments).send({
        message: "App interaction logging failed: missing parameter.",
      });
    }
    let appInteractionLog;
    try {
      appInteractionLog = new AppInteractionLog(
        JSON.parse(req.body.appInteractionLog),
      );
    } catch (err) {
      return res.status(LogAppInteractionStatus.Invalid).send({
        message: "App interaction logging failed: could not be deserialized.",
      });
    }
    if (!appInteractionLog) {
      return res.status(LogAppInteractionStatus.Invalid).send({
        message: "App interaction logging failed: could not be deserialized.",
      });
    }

    appInteractionLog.user = req.token._id;
    try {
      let saved = await appInteractionLog.save();
      if (!saved) {
        return res.status(LogAppInteractionStatus.InternalError).send({
          message: "App interaction logging failed: failed to save.",
        });
      }
      return res
        .status(LogAppInteractionStatus.Logged)
        .send({ message: "App interaction logged." });
    } catch (err) {
      logger.error(err);
      return res.status(LogAppInteractionStatus.InternalError).send({
        message: "App interaction logging failed: failed to save. (error)",
      });
    }
  },
  logAppUserInteraction: async function (req, res) {
    if (!req.body.appUserInteractionLog) {
      res.status(LogAppUserInteractionStatus.MissingArguments).send({
        message: "App user interaction logging failed: missing parameter.",
      });
      return;
    }
    let appUserInteractionLog;
    try {
      appUserInteractionLog = new AppUserInteractionLog(
        JSON.parse(req.body.appUserInteractionLog),
      );
    } catch (err) {
      return res.status(LogAppUserInteractionStatus.Invalid).send({
        message:
          "App user interaction logging failed: could not be deserialized.",
      });
    }
    if (!appUserInteractionLog) {
      return res.status(LogAppUserInteractionStatus.Invalid).send({
        message:
          "App user interaction logging failed: could not be deserialized.",
      });
    }

    appUserInteractionLog.user = req.token._id;
    try {
      let saved = await appUserInteractionLog.save();
      if (!saved) {
        return res.status(LogAppUserInteractionStatus.InternalError).send({
          message: "App user interaction logging failed: failed to save.",
        });
      }
      return res
        .status(LogAppUserInteractionStatus.Logged)
        .send({ message: "App user interaction logged." });
    } catch (err) {
      logger.error(err);
      return res.status(LogAppUserInteractionStatus.InternalError).send({
        message: "App user interaction logging failed: failed to save. (error)",
      });
    }
  },
  logSurveyAnswer: async function (req, res) {
    if (!req.body.surveyAnswer) {
      logger.warn(
        "Survey answer logging failed: missing survey answer parameter.",
      );
      return res.status(LogSurveyAnswerStatus.MissingArguments).send({
        message:
          "Survey answer logging failed: missing survey answer parameter.",
      });
    }
    let surveyAnswer;
    try {
      surveyAnswer = ModelHelper.decodeSurveyAnswer(
        JSON.parse(req.body.surveyAnswer),
      );
    } catch (err) {
      return res.status(LogSurveyAnswerStatus.InvalidSurveyAnswer).send({
        message:
          "Survey answer logging failed: survey user answer could not be decoded.",
      });
    }
    if (!surveyAnswer) {
      return res.status(LogSurveyAnswerStatus.InvalidSurveyAnswer).send({
        message:
          "Survey answer logging failed: survey user answer could not be decoded.",
      });
    }

    surveyAnswer.user = req.token._id;
    try {
      let saved = await surveyAnswer.save();
      if (!saved) {
        logger.warn(
          "Survey answer logging failed: failed to save answer, there may be invalid fields such as the quiz id.",
        );
        return res.status(LogSurveyAnswerStatus.InternalError).send({
          message:
            "Survey answer logging failed: failed to save answer, there may be invalid fields such as the quiz id.",
        });
      }
      return res
        .status(LogSurveyAnswerStatus.Logged)
        .send({ message: "Survey answer logged." });
    } catch (err) {
      if (err && (err.code === 11000 || err.codeName === "DuplicateKey")) {
        return res.status(LogSurveyAnswerStatus.AlreadyLogged).send({
          message:
            "Survey answer logging failed: this survey has already been answered by the user.",
        });
      }
      logger.error(err);
      return res.status(LogSurveyAnswerStatus.InternalError).send({
        message: "Survey answer logging failed: failed to store answer.",
      });
    }
  },
  logPlayContext: async function (req, res) {
    if (!req.body.playContext) {
      return res.status(LogPlayContext.MissingArguments).send({
        message: "Play context logging failed: parameter missing.",
      });
    }
    let playContext;
    try {
      playContext = ModelHelper.decodePlayContext(
        JSON.parse(req.body.playContext),
      );
    } catch (err) {
      return res.status(LogPlayContext.InternalError).send({
        message:
          "Play context logging failed: play context could not be deserialized.",
      });
    }
    if (!playContext) {
      return res.status(LogPlayContext.InternalError).send({
        message:
          "Play context logging failed: play context could not be deserialized.",
      });
    }

    playContext.user = req.token._id;
    var obj = playContext.toObject();
    if (obj._id) {
      delete obj._id;
    }

    try {
      const updateResult = await PlayContext.updateOne(
        { contextId: playContext.contextId },
        obj,
        {
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      ).exec();
      if (
        !updateResult.acknowledged ||
        (updateResult.upsertedCount == 0 && updateResult.modifiedCount == 0)
      ) {
        return res.status(LogPlayContext.InternalError).send({
          message:
            "Play context logging failed: play context could not be saved/updated.",
        });
      }
      if (updateResult.upsertedCount === 1) {
        return res.status(LogPlayContext.Logged).send({
          message: "Play context logged.",
        });
      } else {
        return res.status(LogPlayContext.Updated).send({
          message: "Play context updated.",
        });
      }
    } catch (err) {
      logger.error(err);
      return res.status(LogPlayContext.InternalError).send({
        message:
          "Play context logging failed: play context could not be saved/updated. (error)",
      });
    }
  },
};

module.exports = functions;
