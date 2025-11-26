import mongoose from 'mongoose';
import ModelHelper from '../../middleware/modelHelper';
import { SurveyAnswerDocument } from '../../models/logs/surveyAnswer';
import logger from '../../middleware/logger';
import {
  AppInteractionLogDocument,
  AppInteractionLogModel,
} from '../../models/logs/appInteractionLog';
import {
  AppUserInteractionLogDocument,
  AppUserInteractionLogModel,
} from '../../models/logs/appUserInteractionLog';
import {
  PlayContextDocument,
  PlayContextModel,
} from '../../models/logs/playContext';
import { Response } from 'express';

// Possible status codes
enum LogAppInteractionStatus {
  Logged = 200,
  MissingArguments = 400,
  Invalid = 452,
  InternalError = 500,
}
enum LogAppUserInteractionStatus {
  Logged = 200,
  MissingArguments = 400,
  Invalid = 452,
  InternalError = 500,
}
enum LogSurveyAnswerStatus {
  Logged = 200,
  AlreadyLogged = 209,
  MissingArguments = 400,
  InvalidSurveyAnswer = 452,
  InternalError = 500,
}
enum LogPlayContext {
  Logged = 200,
  Updated = 209,
  MissingArguments = 400,
  InternalError = 500,
}

const functions = {
  // DEPRECATED: replaced with logAppUserInteraction.
  // This old endpoint is retained for compatibility with older client versions.
  logAppInteraction: async function (
    req: Express.AuthenticatedRequest<{}, {}, { appInteractionLog: string }>,
    res: Response
  ) {
    if (!req.body.appInteractionLog) {
      return res.status(LogAppInteractionStatus.MissingArguments).send({
        message: 'App interaction logging failed: missing parameter.',
      });
    }
    let appInteractionLog: AppInteractionLogDocument;
    try {
      appInteractionLog = new AppInteractionLogModel(
        JSON.parse(req.body.appInteractionLog)
      );
    } catch (_: unknown) {
      return res.status(LogAppInteractionStatus.Invalid).send({
        message: 'App interaction logging failed: could not be deserialized.',
      });
    }
    if (!appInteractionLog) {
      return res.status(LogAppInteractionStatus.Invalid).send({
        message: 'App interaction logging failed: could not be deserialized.',
      });
    }

    appInteractionLog.user = new mongoose.Types.ObjectId(req.token._id);
    try {
      let saved = await appInteractionLog.save();
      if (!saved) {
        return res.status(LogAppInteractionStatus.InternalError).send({
          message: 'App interaction logging failed: failed to save.',
        });
      }
      return res
        .status(LogAppInteractionStatus.Logged)
        .send({ message: 'App interaction logged.' });
    } catch (err: unknown) {
      logger.error(`Failed to save appInteractionLog: ${err}`);
      return res.status(LogAppInteractionStatus.InternalError).send({
        message: 'App interaction logging failed: failed to save. (error)',
      });
    }
  },
  logAppUserInteraction: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { appUserInteractionLog: string }
    >,
    res: Response
  ) {
    if (!req.body.appUserInteractionLog) {
      return res.status(LogAppUserInteractionStatus.MissingArguments).send({
        message: 'App user interaction logging failed: missing parameter.',
      });
    }
    let appUserInteractionLog: AppUserInteractionLogDocument;
    try {
      appUserInteractionLog = new AppUserInteractionLogModel(
        JSON.parse(req.body.appUserInteractionLog)
      );
    } catch (_err: unknown) {
      return res.status(LogAppUserInteractionStatus.Invalid).send({
        message:
          'App user interaction logging failed: could not be deserialized.',
      });
    }
    if (!appUserInteractionLog) {
      return res.status(LogAppUserInteractionStatus.Invalid).send({
        message:
          'App user interaction logging failed: could not be deserialized.',
      });
    }

    appUserInteractionLog.user = new mongoose.Types.ObjectId(req.token._id);
    try {
      let saved = await appUserInteractionLog.save();
      if (!saved) {
        return res.status(LogAppUserInteractionStatus.InternalError).send({
          message: 'App user interaction logging failed: failed to save.',
        });
      }
      return res
        .status(LogAppUserInteractionStatus.Logged)
        .send({ message: 'App user interaction logged.' });
    } catch (err: unknown) {
      logger.error(`Failed to save appUserInteractionLog: ${err}`);
      return res.status(LogAppUserInteractionStatus.InternalError).send({
        message: 'App user interaction logging failed: failed to save. (error)',
      });
    }
  },
  logSurveyAnswer: async function (
    req: Express.AuthenticatedRequest<{}, {}, { surveyAnswer: string }>,
    res: Response
  ) {
    if (!req.body.surveyAnswer) {
      logger.warn(
        'Survey answer logging failed: missing survey answer parameter.'
      );
      return res.status(LogSurveyAnswerStatus.MissingArguments).send({
        message:
          'Survey answer logging failed: missing survey answer parameter.',
      });
    }
    let surveyAnswer: SurveyAnswerDocument | null;
    try {
      surveyAnswer = ModelHelper.decodeSurveyAnswer(
        JSON.parse(req.body.surveyAnswer)
      );
    } catch (_: unknown) {
      return res.status(LogSurveyAnswerStatus.InvalidSurveyAnswer).send({
        message:
          'Survey answer logging failed: survey user answer could not be decoded.',
      });
    }
    if (!surveyAnswer) {
      return res.status(LogSurveyAnswerStatus.InvalidSurveyAnswer).send({
        message:
          'Survey answer logging failed: survey user answer could not be decoded.',
      });
    }

    surveyAnswer.user = new mongoose.Types.ObjectId(req.token._id);
    try {
      let saved = await surveyAnswer.save();
      if (!saved) {
        logger.warn(
          'Survey answer logging failed: failed to save answer, there may be invalid fields such as the quiz id.'
        );
        return res.status(LogSurveyAnswerStatus.InternalError).send({
          message:
            'Survey answer logging failed: failed to save answer, there may be invalid fields such as the quiz id.',
        });
      }
      return res
        .status(LogSurveyAnswerStatus.Logged)
        .send({ message: 'Survey answer logged.' });
    } catch (err: unknown) {
      if (
        err &&
        err instanceof mongoose.mongo.MongoError &&
        err.code === 11000
      ) {
        return res.status(LogSurveyAnswerStatus.AlreadyLogged).send({
          message:
            'Survey answer logging failed: this survey has already been answered by the user.',
        });
      }
      logger.error(`Failed to save surveyAnswer: ${err}`);
      return res.status(LogSurveyAnswerStatus.InternalError).send({
        message: 'Survey answer logging failed: failed to store answer.',
      });
    }
  },
  logPlayContext: async function (
    req: Express.AuthenticatedRequest<{}, {}, { playContext: string }>,
    res: Response
  ) {
    if (!req.body.playContext) {
      return res.status(LogPlayContext.MissingArguments).send({
        message: 'Play context logging failed: parameter missing.',
      });
    }
    let playContext: PlayContextDocument | null;
    try {
      playContext = ModelHelper.decodePlayContext(
        JSON.parse(req.body.playContext)
      );
    } catch (_: unknown) {
      return res.status(LogPlayContext.InternalError).send({
        message:
          'Play context logging failed: play context could not be deserialized.',
      });
    }
    if (!playContext) {
      return res.status(LogPlayContext.InternalError).send({
        message:
          'Play context logging failed: play context could not be deserialized.',
      });
    }

    playContext.user = new mongoose.Types.ObjectId(req.token._id);
    var obj = playContext.toObject();
    // destructuring to get rid of _id property
    const { _id, ...objWithoutId } = obj;

    try {
      const updateResult = await PlayContextModel.updateOne(
        { contextId: playContext.contextId },
        objWithoutId,
        {
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      ).exec();
      if (
        !updateResult.acknowledged ||
        (updateResult.upsertedCount == 0 && updateResult.modifiedCount == 0)
      ) {
        return res.status(LogPlayContext.InternalError).send({
          message:
            'Play context logging failed: play context could not be saved/updated.',
        });
      }
      if (updateResult.upsertedCount === 1) {
        return res.status(LogPlayContext.Logged).send({
          message: 'Play context logged.',
        });
      } else {
        return res.status(LogPlayContext.Updated).send({
          message: 'Play context updated.',
        });
      }
    } catch (err: unknown) {
      logger.error(`Failed to save playContext: ${err}`);
      return res.status(LogPlayContext.InternalError).send({
        message:
          'Play context logging failed: play context could not be saved/updated. (error)',
      });
    }
  },
};

export default functions;
