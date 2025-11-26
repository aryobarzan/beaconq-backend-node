import { ActivityUserAnswerModel } from '../models/logs/activityUserAnswer';
import { QuizModel } from '../models/quiz';
import mongoose from 'mongoose';
import { ScheduledQuizUserStartModel } from '../models/logs/scheduledQuizUserStart';
import ModelHelper from '../middleware/modelHelper';
import { DateTime } from 'luxon';
import logger from '../middleware/logger';
import SurveyHelper from '../middleware/surveyHelper';
import { PlayContextModel } from '../models/logs/playContext';
import { CourseDocument, CourseModel } from '../models/course';
import { ScheduledQuizDocument } from '../models/scheduledQuiz';
import { Response } from 'express';

// Possible status codes
enum ScheduledQuizStatus {
  CanStart = 0,
  CanContinue = 1,
  HasFinished = 2,
  IsOver = 3,
  NotAvailable = 4,
}
enum CheckScheduledQuizzesStatus {
  Retrieved = 200,
  NoRegisteredCourses = 209,
  InternalError = 500,
}
enum PlayScheduledQuizStatus {
  CanPlay = 200,
  AlreadyPlayedAllActivities = 209,
  NotYetAvailable = 210,
  MissingArguments = 400,
  InvalidScheduledQuizId = 452,
  PlayPeriodOver = 455,
  InternalError = 500,
}
enum CheckScheduledQuizSurveyStatus {
  Available = 200,
  AlreadyTaken = 209,
  MissingArguments = 400,
  InvalidScheduledQuizId = 452,
  PlayPeriodOver = 455,
  InternalError = 500,
}
enum TrialQuizPlayStatusCode {
  Played = 200,
  NotPlayed = 209,
  NoTrialQuiz = 210,
  MissingArguments = 400,
  InternalError = 500,
}

async function checkScheduledQuizUserStatus(
  scheduledQuizId: string,
  userIdString: string,
  excludeOld: boolean
) {
  try {
    const userId = new mongoose.Types.ObjectId(userIdString);
    const scheduledQuiz = await ModelHelper.findScheduledQuiz(scheduledQuizId);
    if (!scheduledQuiz) {
      return {
        err: new Error('Scheduled quiz does not exist.'),
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId: null,
      };
    }
    const quiz = await QuizModel.findById(scheduledQuiz.quiz).lean().exec();
    if (!quiz) {
      return {
        err: new Error('Quiz does not exist.'),
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
      logger.warn(`Scheduled quiz missing start/end date: ${scheduledQuizId}`);
      return {
        err: new Error('Scheduled quiz missing scheduling dates.'),
        quizStatus: null,
        availableActivities: null,
        availablePlayTime: null,
        availableSurveyQuestions: null,
        scheduledQuizId,
      };
    }

    const currentDate = DateTime.now().setZone('utc');
    const scheduledQuizStartDateTime = DateTime.fromJSDate(
      scheduledQuiz.startDateTime,
      { zone: 'utc' }
    );
    const scheduledQuizEndDateTime = DateTime.fromJSDate(
      scheduledQuiz.endDateTime,
      { zone: 'utc' }
    );

    // If it's an older scheduled quiz which has expired, don't analyze it and just return null.
    // This is an optimization measure.
    if (
      excludeOld &&
      currentDate > scheduledQuizEndDateTime &&
      currentDate.diff(scheduledQuizEndDateTime, 'months').as('months') > 4
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
      ActivityUserAnswerModel.find(
        { scheduledQuiz: scheduledQuiz._id, user: userId },
        'activity -_id'
      )
        .lean()
        .exec(),
      ScheduledQuizUserStartModel.findOne({
        scheduledQuiz: scheduledQuiz._id,
        user: userId,
      })
        .lean()
        .exec(),
    ]);
    // Use set for O(1) lookups when using has(...)
    const playedActivitiesSet = new Set(
      (activityUserAnswers || []).map((e) => e.activity.toString())
    );

    const availableActivities = possibleActivities.filter(
      (activityId) => !playedActivitiesSet.has(activityId)
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
      { zone: 'utc' }
    );

    const playDurationMicro = scheduledQuiz.playDuration || 0;
    const playDurationSeconds = playDurationMicro / 1_000_000;

    const elapsedSeconds = currentDate
      .diff(scheduledQuizStartDate, 'seconds')
      .as('seconds');
    let remainingSeconds = playDurationSeconds - elapsedSeconds;

    // Ensure a minimum value of 0
    if (!Number.isFinite(remainingSeconds)) remainingSeconds = 0;

    const hasFinished =
      !Array.isArray(availableActivities) || availableActivities.length === 0;
    const hasRunOutOfTime = remainingSeconds <= 0;

    // Check survey status
    const surveyStatus = await SurveyHelper.checkScheduledQuizSurveyUserStatus(
      userId.toString(),
      scheduledQuiz
      // TODO: verify if removed arguments is valid
    );

    if (!surveyStatus) {
      return {
        err: new Error('Survey status could not be checked.'),
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
      currentDate.diff(scheduledQuizEndDateTime, 'days').as('days') > 1;
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
        availablePlayTime: Math.max(0, remainingSeconds * 1000000),
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
  } catch (err: unknown) {
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

async function checkScheduledQuizzesUserStatus(
  coursesRaw: CourseDocument[],
  userId: string
) {
  const courses = Array.isArray(coursesRaw) ? coursesRaw : [coursesRaw];
  const courseStatuses = {};
  // we process the status of a course's scheduled quizzes in batches to avoid
  // overwhelming the database with too many queries in parallel by limiting the concurrency.
  async function mapInBatches(
    items: ScheduledQuizDocument[],
    fn: (item: ScheduledQuizDocument) => Promise<
      | {
          scheduledQuizId: mongoose.Types.ObjectId;
          ok: boolean;
          res: any;
        }
      | {
          scheduledQuizId: mongoose.Types.ObjectId;
          ok: boolean;
          err: any;
        }
    >,
    batchSize: number = 20
  ) {
    const output: PromiseSettledResult<
      | {
          scheduledQuizId: mongoose.Types.ObjectId;
          ok: boolean;
          res: any;
        }
      | {
          scheduledQuizId: mongoose.Types.ObjectId;
          ok: boolean;
          err: any;
        }
    >[] = [];
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
      const scheduledQuizzes: ScheduledQuizDocument[] =
        course.getScheduledQuizzes() || [];
      if (!scheduledQuizzes || scheduledQuizzes.length === 0) {
        courseStatuses[course._id.toString()] = statuses;
        continue;
      }

      const settledPromises = await mapInBatches(scheduledQuizzes, (sq) =>
        checkScheduledQuizUserStatus(sq._id.toString(), userId, true)
          .then((res) => ({ scheduledQuizId: sq._id, ok: true, res }))
          .catch((err) => ({ scheduledQuizId: sq._id, ok: false, err }))
      );

      for (let i = 0; i < settledPromises.length; i++) {
        const item = settledPromises[i];
        const expectedSq = scheduledQuizzes[i];
        if (item && item.status === 'fulfilled') {
          const payload = item.value;
          // Payload is { scheduledQuizId, ok: true, res }
          // In case of error: { scheduledQuizId, ok: false, err }
          if (
            payload &&
            payload.ok &&
            'res' in payload &&
            payload.res &&
            payload.res.scheduledQuizId
          ) {
            statuses[payload.res.scheduledQuizId] = payload.res;
          } else if (
            payload &&
            'res' in payload &&
            payload.res &&
            payload.res.isOld
          ) {
            // skip old scheduled quizzes
          } else {
            // Unexpected payload shape
            logger.error(
              `Unexpected scheduled quiz status payload for scheduled quiz ${expectedSq?._id} with payload: ${JSON.stringify(payload)}`
            );
          }
        } else {
          // promise rejected: log with scheduledQuiz id and continue
          logger.error(
            `Failed to check scheduled quiz status for scheduled quiz ${expectedSq?._id}: ${item}`
          );
        }
      }

      courseStatuses[course._id.toString()] = statuses;
    } catch (err: unknown) {
      logger.error(
        `Error checking scheduled quizzes for course ${course._id}: ${err}`
      );
      courseStatuses[course._id.toString()] = {};
    }
  }

  return courseStatuses;
}

const functions = {
  // Check status of all scheduled quizzes from the user's registered courses
  checkScheduledQuizzes: async function (
    req: Express.AuthenticatedRequest,
    res: Response
  ) {
    try {
      const registeredCourses = await ModelHelper.getUserRegisteredCourses(
        req.token._id
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
        req.token._id
      );
      if (!statuses) {
        return res.status(CheckScheduledQuizzesStatus.InternalError).send({
          message: "Can't check scheduled quiz status: internal error.",
        });
      }

      // Return the statuses object directly (not stringified) for easier consumption by clients
      return res.status(CheckScheduledQuizzesStatus.Retrieved).send({
        message: 'Retrieved scheduled quiz statuses.',
        statuses: JSON.stringify(statuses),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(CheckScheduledQuizzesStatus.InternalError).send({
        message: "Can't check scheduled quiz status: internal error.",
      });
    }
  },
  checkTrialQuizPlayStatus: async function (
    req: Express.AuthenticatedRequest<{ courseId: string }>,
    res: Response
  ) {
    if (!req.params.courseId) {
      return res.status(TrialQuizPlayStatusCode.MissingArguments).send({
        message: "Can't check trial quiz play status: missing arguments.",
      });
    }

    const rawCourseId = req.params.courseId;
    if (!mongoose.isValidObjectId(rawCourseId)) {
      logger.error(`Invalid courseId for trial quiz check: ${rawCourseId}`);
      return res.status(TrialQuizPlayStatusCode.MissingArguments).send({
        message: "Can't check trial quiz play status: missing argument. (ERR1)",
      });
    }

    const courseId = new mongoose.Types.ObjectId(rawCourseId);

    try {
      // We just select (retain) the trialQuiz field which we need.
      const course = await CourseModel.findById(courseId, 'trialQuiz')
        .lean()
        .exec();
      if (!course) {
        logger.error(
          `Failed to find course to check its trial quiz play status: ${rawCourseId}`
        );
        return res.status(TrialQuizPlayStatusCode.InternalError).send({
          message: 'Failed to check trial quiz play status. (ERR12)',
        });
      }

      if (!course.trialQuiz) {
        return res.status(TrialQuizPlayStatusCode.NoTrialQuiz).send({
          message: 'There is no trial quiz for this course.',
        });
      }

      // Only fetch the fields contextId and activities to compute unique activity ids
      const playContexts = await PlayContextModel.find(
        { user: req.token._id, course: courseId, playType: 'trialQuiz' },
        'contextId activities'
      )
        .lean()
        .exec();

      if (!playContexts || playContexts.length === 0) {
        return res.status(TrialQuizPlayStatusCode.NotPlayed).send({
          message:
            'The user has not yet played the trial quiz for this course.',
        });
      }

      // Collect unique activity ids across all play contexts
      const contextIds = playContexts.map((p) => p.contextId);
      const uniqueActivityIdsSet: Set<string> = new Set();
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
        return res.status(TrialQuizPlayStatusCode.NotPlayed).send({
          message:
            'The user has not yet played the trial quiz for this course.',
        });
      }

      // Get the distinct activities the user has answered during those play contexts.
      const answeredActivityIds = await ActivityUserAnswerModel.distinct(
        'activity',
        {
          user: req.token._id,
          playContextId: { $in: contextIds },
        }
      );

      const answeredSet = new Set(
        (answeredActivityIds || []).map((x) => x.toString())
      );
      if (answeredSet.size >= uniqueActivityIds.length) {
        return res.status(TrialQuizPlayStatusCode.Played).send({
          message: 'The user has played the trial quiz for this course.',
        });
      }

      // Return remaining activity ids which have not been answered yet
      const remainingActivityIds = uniqueActivityIds.filter(
        (id) => !answeredSet.has(id)
      );
      return res.status(TrialQuizPlayStatusCode.NotPlayed).send({
        message:
          'The user has not yet fully played the trial quiz for this course.',
        remainingActivities: remainingActivityIds,
      });
    } catch (err: unknown) {
      logger.error(
        `Error while checking trial quiz play status for course ${rawCourseId}: ${err}`
      );
      return res.status(TrialQuizPlayStatusCode.InternalError).send({
        message: 'Failed to check trial quiz play status. (ERR2)',
      });
    }
  },
  playScheduledQuiz: async function (
    req: Express.AuthenticatedRequest<
      Record<string, never>,
      Record<string, never>,
      { scheduledQuizId: string; timestamp: string }
    >,
    res: Response
  ) {
    if (!req.body.scheduledQuizId || !req.body.timestamp) {
      logger.warn("Can't play scheduled quiz: missing arguments.");
      return res
        .status(PlayScheduledQuizStatus.MissingArguments)
        .send({ message: "Can't play scheduled quiz: missing arguments." });
    }

    const rawScheduledQuizId = req.body.scheduledQuizId;
    if (!mongoose.isValidObjectId(rawScheduledQuizId)) {
      logger.error(
        `Invalid scheduledQuizId for playScheduledQuiz: ${rawScheduledQuizId}`
      );
      return res.status(PlayScheduledQuizStatus.MissingArguments).send({
        message:
          "Can't play scheduled quiz: specified scheduled quiz id is not the right type.",
      });
    }

    try {
      const status = await checkScheduledQuizUserStatus(
        rawScheduledQuizId,
        req.token._id,
        false
      );

      if (!status || status.err) {
        logger.error(
          `Failed to check scheduled quiz status before play for scheduledQuizId ${rawScheduledQuizId}: ${status?.err}`
        );
        return res.status(PlayScheduledQuizStatus.InternalError).send({
          message: "Can't play scheduled quiz: internal error occurred.",
        });
      }

      switch (status.quizStatus) {
        case ScheduledQuizStatus.CanStart: {
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              const existingScheduledQuizUserStart =
                await ScheduledQuizUserStartModel.findOne(
                  { scheduledQuiz: rawScheduledQuizId, user: req.token._id },
                  null,
                  { session }
                ).exec();

              if (existingScheduledQuizUserStart) {
                return;
              }

              const scheduledQuizUserStart = new ScheduledQuizUserStartModel({
                scheduledQuiz: rawScheduledQuizId,
                timestamp: req.body.timestamp,
                user: req.token._id,
              });

              await scheduledQuizUserStart.save({
                session,
              });
            });

            return res.status(PlayScheduledQuizStatus.CanPlay).send({
              status: status.quizStatus,
              activities: status.availableActivities,
              availablePlayTime: status.availablePlayTime,
            });
          } catch (err: unknown) {
            logger.error(
              `Transaction failed while creating ScheduledQuizUserStart for scheduledQuizId ${rawScheduledQuizId}: ${err}`
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
    } catch (err: unknown) {
      logger.error(
        `Unhandled error in playScheduledQuiz for scheduledQuizId ${rawScheduledQuizId}: ${err}`
      );
      return res.status(PlayScheduledQuizStatus.InternalError).send({
        message: "Can't play scheduled quiz: internal error occurred.",
      });
    }
  },
  checkScheduledQuizSurveyStatus: async function (
    req: Express.AuthenticatedRequest<{ scheduledQuizId: string }>,
    res: Response
  ) {
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
        req.params.scheduledQuizId
      );
      if (!scheduledQuiz) {
        return res
          .status(CheckScheduledQuizSurveyStatus.MissingArguments)
          .send({
            message:
              "Can't check survey status: specified scheduled quiz could not be found.",
          });
      }
      const surveyStatus =
        await SurveyHelper.checkScheduledQuizSurveyUserStatus(
          req.token._id,
          scheduledQuiz
        );
      if (!surveyStatus) {
        return res.status(CheckScheduledQuizSurveyStatus.InternalError).send({
          message: "Can't check survey status: an error occurred.",
        });
      }
      if (surveyStatus.existingSurveyAnswer) {
        return res.status(CheckScheduledQuizSurveyStatus.AlreadyTaken).send({
          message:
            'The user has already taken the survey for this scheduled quiz.',
        });
      } else if (surveyStatus.questions) {
        return res.status(CheckScheduledQuizSurveyStatus.Available).send({
          message: 'The user can take a survey for this scheduled quiz.',
          availableSurveyQuestions: surveyStatus.questions,
        });
      } else {
        return res.status(CheckScheduledQuizSurveyStatus.PlayPeriodOver).send({
          message:
            'The user can no longer take a survey for this scheduled quiz.',
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      return res.status(CheckScheduledQuizSurveyStatus.InternalError).send({
        message: "Can't check survey status: an error occurred.",
      });
    }
  },
};

export default functions;
