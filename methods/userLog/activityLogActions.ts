import { ActivityUserAnswerDocument } from '../../models/logs/activityUserAnswer';
import mongoose from 'mongoose';
import ModelHelper from '../../middleware/modelHelper';
import logger from '../../middleware/logger';
import { ActivityUserInteractionDocument } from '../../models/logs/activityUserInteraction';
import { Response } from 'express';

// Possible status codes
enum LogActivityUserAnswerStatus {
  Logged = 200,
  AlreadyLogged = 209,
  MissingArguments = 400,
  InvalidScheduledQuizId = 452,
  InvalidActivityUserAnswer = 455,
  InternalError = 500,
}
enum LogActivityUserAnswersStatus {
  Logged = 200,
  NothingToLog = 452,
  MissingArguments = 400,
  InternalError = 500,
}
enum LogActivityFeedbackViewStatus {
  Logged = 200,
  Incremented = 209,
  MissingArguments = 400,
  InvalidScheduledQuizId = 452,
  InvalidActivityFeedbackView = 454,
  InternalError = 500,
}
enum LogActivityUserInteractionStatus {
  Logged = 200,
  MissingArguments = 400,
  InvalidActivityUserInteraction = 452,
  InternalError = 500,
}

async function saveActivityUserAnswer(
  activityUserAnswer: ActivityUserAnswerDocument
): Promise<[number, string, ActivityUserAnswerDocument | null]> {
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
  } catch (err: unknown) {
    // If the DuplicateKey error is thrown by the save(), indicate that the answer has already been logged.
    if (err && err instanceof mongoose.mongo.MongoError && err.code === 11000) {
      return [
        LogActivityUserAnswerStatus.AlreadyLogged,
        'Failed to save user activity answer: it is already logged.',
        null,
      ];
    }
    logger.warn(err);
    return [
      LogActivityUserAnswerStatus.InternalError,
      'Failed to save user activity answer: an error occurred while saving.',
      null,
    ];
  }
}

const functions = {
  logActivityUserAnswer: async function (
    req: Express.AuthenticatedRequest<{}, {}, { activityUserAnswer: string }>,
    res: Response
  ) {
    if (!req.body || !req.body.activityUserAnswer) {
      logger.warn('Activity answer logging failed: missing arguments.');
      return res.status(LogActivityUserAnswerStatus.MissingArguments).send({
        message: 'Activity answer logging failed: missing arguments.',
      });
    }

    let decodedActivityUserAnswer: ActivityUserAnswerDocument | null;
    try {
      decodedActivityUserAnswer = ModelHelper.decodeActivityUserAnswer(
        JSON.parse(req.body.activityUserAnswer)
      );
    } catch (err: unknown) {
      logger.warn(`Failed to parse activityUserAnswer payload: ${err}`);
      return res
        .status(LogActivityUserAnswerStatus.InvalidActivityUserAnswer)
        .send({
          message:
            'Activity answer logging failed: activity user answer could not be deserialized.',
        });
    }

    if (!decodedActivityUserAnswer) {
      return res
        .status(LogActivityUserAnswerStatus.InvalidActivityUserAnswer)
        .send({
          message:
            'Activity answer logging failed: activity user answer could not be deserialized.',
        });
    }

    // Attach user ID from token
    decodedActivityUserAnswer.user = new mongoose.Types.ObjectId(req.token._id);

    // Answered activity in the context of a scheduled quiz
    if (decodedActivityUserAnswer.scheduledQuiz) {
      if (!mongoose.isValidObjectId(decodedActivityUserAnswer.scheduledQuiz)) {
        logger.warn(
          `Invalid scheduledQuiz id in activity answer: ${decodedActivityUserAnswer.scheduledQuiz}`
        );
        return res
          .status(LogActivityUserAnswerStatus.InvalidScheduledQuizId)
          .send({
            message:
              'Activity answer logging failed: specified scheduled quiz id is not the right type.',
          });
      }
      try {
        const scheduledQuiz = await ModelHelper.findScheduledQuiz(
          decodedActivityUserAnswer.scheduledQuiz.toString()
        );
        if (!scheduledQuiz) {
          return res
            .status(LogActivityUserAnswerStatus.InvalidScheduledQuizId)
            .send({
              message:
                'Activity answer logging failed: specified scheduled quiz could not be found.',
            });
        }
        decodedActivityUserAnswer.scheduledQuiz = scheduledQuiz._id;
      } catch (err: unknown) {
        logger.error(
          `Error while validating scheduled quiz for activity answer: ${err}`
        );
        return res
          .status(LogActivityUserAnswerStatus.InvalidScheduledQuizId)
          .send({
            message:
              'Activity answer logging failed: failed to find scheduled quiz with indicated ID. (error)',
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
    } catch (err: unknown) {
      logger.error(`Unexpected error in logActivityUserAnswer: ${err}`);
      return res.status(LogActivityUserAnswerStatus.InternalError).send({
        message:
          'Activity answer logging failed: an internal error occurred while saving.',
      });
    }
  },
  logActivityUserAnswers: async function (
    req: Express.AuthenticatedRequest<{}, {}, { activityUserAnswers: string }>,
    res: Response
  ) {
    if (!req.body.activityUserAnswers) {
      logger.warn('Activity answers logging failed: missing arguments.');
      return res.status(LogActivityUserAnswersStatus.MissingArguments).send({
        message: 'Activity answers logging failed: missing arguments.',
      });
    }

    let rawAnswersArray: any;
    try {
      rawAnswersArray = JSON.parse(req.body.activityUserAnswers);
    } catch (err) {
      logger.warn(`Failed to parse activityUserAnswers payload: ${err}`);
      return res.status(LogActivityUserAnswersStatus.MissingArguments).send({
        message: 'Activity answers logging failed: invalid payload.',
      });
    }

    const activityUserAnswers: ActivityUserAnswerDocument[] = [];
    if (Array.isArray(rawAnswersArray)) {
      for (const rawAnswer of rawAnswersArray) {
        const decoded = ModelHelper.decodeActivityUserAnswer(rawAnswer);
        if (decoded) {
          decoded.user = new mongoose.Types.ObjectId(req.token._id);
          activityUserAnswers.push(decoded);
        } else {
          logger.warn(`Failed to decode activity user answer: ${rawAnswer}`);
        }
      }
    }

    if (activityUserAnswers.length === 0) {
      return res.status(LogActivityUserAnswersStatus.NothingToLog).send({
        message:
          'Activity answers logging failed: activity user answers could not be deserialized.',
      });
    }

    // TODO (?): also validate scheduledQuiz field to be consistent with the single-insert endpoint logActivityUserAnswer().

    // // Ensure we have Mongoose document instances so save(...) exists.
    //     const activityUserAnswerDocs = activityUserAnswers.map((a) =>
    //       a && typeof a.save === "function" ? a : new ActivityUserAnswer.base(a),
    //     );
    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      logger.error(
        `Failed to start MongoDB session for transactional batch: ${err}`
      );
      return res.status(LogActivityUserAnswersStatus.InternalError).send({
        message: 'Failed to log activity answers: could not start DB session.',
      });
    }

    try {
      let insertedCount = 0;
      const alreadyLoggedAnswerTimestamps: Date[] = [];

      await session.withTransaction(async () => {
        for (const activityUserAnswer of activityUserAnswers) {
          try {
            await activityUserAnswer.save({ session });
            insertedCount += 1;
          } catch (err: unknown) {
            // Duplicate key: already logged
            if (
              err &&
              err instanceof mongoose.mongo.MongoError &&
              err.code === 11000
            ) {
              alreadyLoggedAnswerTimestamps.push(activityUserAnswer.timestamp);
              continue;
            }
            // Any other error should abort the transaction
            logger.error(
              `Error saving activity answer inside transaction: ${err}`
            );
            throw err;
          }
        }
      });

      return res.status(LogActivityUserAnswersStatus.Logged).send({
        message: 'Activity answers logged.',
        insertedCount,
        alreadyLoggedAnswerTimestamps,
      });
    } catch (err: unknown) {
      logger.error(`Failed to log activity answers: ${err}`);
      return res.status(LogActivityUserAnswersStatus.InternalError).send({
        message: 'Failed to log activity answers.',
      });
    } finally {
      session.endSession();
    }
  },
  logActivityFeedbackView: async function (
    req: Express.AuthenticatedRequest<{}, {}, { activityFeedbackView: string }>,
    res: Response
  ) {
    if (!req.body.activityFeedbackView) {
      return res.status(LogActivityFeedbackViewStatus.MissingArguments).send({
        message: 'Activity feedback view logging failed: missing parameter(s).',
      });
    }
    const activityFeedbackView = ModelHelper.decodeActivityFeedbackView(
      JSON.parse(req.body.activityFeedbackView)
    );
    if (!activityFeedbackView) {
      return res
        .status(LogActivityFeedbackViewStatus.InvalidActivityFeedbackView)
        .send({
          message:
            'Activity feedback view logging failed: could not be deserialized.',
        });
    }
    activityFeedbackView.user = new mongoose.Types.ObjectId(req.token._id);
    try {
      let saved = await activityFeedbackView.save();
      if (!saved) {
        return res.status(LogActivityFeedbackViewStatus.InternalError).send({
          message: 'Activity feedback view logging failed: failed to save.',
        });
      }
      return res
        .status(LogActivityFeedbackViewStatus.Logged)
        .send({ message: 'Activity feedback view logged.' });
    } catch (err: unknown) {
      logger.error(`Failed to log activity feedback view: ${err}`);
      return res.status(LogActivityFeedbackViewStatus.InternalError).send({
        message:
          'Activity feedback view logging failed: failed to save. (error)',
      });
    }
  },
  logActivityUserInteraction: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { activityUserInteraction: string }
    >,
    res: Response
  ) {
    if (!req.body.activityUserInteraction) {
      return res
        .status(LogActivityUserInteractionStatus.MissingArguments)
        .send({
          message:
            'Activity user interaction logging failed: missing parameter.',
        });
    }

    let activityUserInteraction: ActivityUserInteractionDocument | null;
    try {
      activityUserInteraction = ModelHelper.decodeActivityUserInteraction(
        JSON.parse(req.body.activityUserInteraction)
      );
    } catch (err: unknown) {
      logger.warn(`Failed to parse activityUserInteraction payload: ${err}`);
      return res
        .status(LogActivityUserInteractionStatus.InvalidActivityUserInteraction)
        .send({
          message: 'Activity user interaction logging failed: invalid payload.',
        });
    }

    if (!activityUserInteraction) {
      return res
        .status(LogActivityUserInteractionStatus.InvalidActivityUserInteraction)
        .send({
          message:
            'Activity user interaction logging failed: could not be deserialized.',
        });
    }

    activityUserInteraction.user = new mongoose.Types.ObjectId(req.token._id);

    if (
      !activityUserInteraction.activity ||
      !activityUserInteraction.timestamp
    ) {
      return res
        .status(LogActivityUserInteractionStatus.MissingArguments)
        .send({
          message:
            'Activity user interaction logging failed: missing activity or timestamp.',
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
            'Activity user interaction logging failed: content too long.',
        });
    }

    try {
      const saved = await activityUserInteraction.save();
      if (!saved) {
        return res.status(LogActivityUserInteractionStatus.InternalError).send({
          message: 'Activity user interaction logging failed: failed to save.',
        });
      }
      return res.status(LogActivityUserInteractionStatus.Logged).send({
        message: 'Activity user interaction logged.',
      });
    } catch (err: unknown) {
      // Duplicate key: already logged
      if (
        err &&
        err instanceof mongoose.mongo.MongoError &&
        err.code === 11000
      ) {
        return res.status(LogActivityUserInteractionStatus.Logged).send({
          message: 'Activity user interaction is already logged.',
        });
      }
      logger.error(`Failed to save activityUserInteraction: ${err}`);
      return res.status(LogActivityUserInteractionStatus.InternalError).send({
        message:
          'Activity user interaction logging failed: failed to save. (error)',
      });
    }
  },
};

export default functions;
