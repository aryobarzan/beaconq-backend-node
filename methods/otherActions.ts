import logger from '../middleware/logger';
import process from 'process';
import ModelHelper from '../middleware/modelHelper';
import AppFeedbackModel, {
  AppFeedbackDocument,
} from '../models/logs/appFeedback';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { UserRole } from '../types/roles';

enum LogAppFeedbackStatus {
  Logged = 200,
  MissingArguments = 400,
  InvalidAppFeedback = 452,
  InternalError = 500,
}
enum GetAppFeedbackStatus {
  Retrieved = 200,
  InternalError = 500,
}

const functions = {
  // DEPRECATED: now returns just an error for backward compatibility reasons with older client versions.
  getFeedbackAPIDetails: function (_: Request, res: Response) {
    return res.status(500).send();
  },
  getOpenAIAPIDetails: function (
    req: Express.AuthenticatedRequest,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: 'You are not authorized to do this.',
      });
    }
    if (!process.env.OPENAIAPI) {
      logger.warn('Open AI API details GET endpoint failed with error 500.');
      return res.status(500).send();
    }
    return res.status(200).send({
      token: process.env.OPENAIAPI,
    });
  },
  sendAppFeedback: async function (req: Request, res: Response) {
    if (!req.files || !Array.isArray(req.files) || req.files.length < 1) {
      return res.status(LogAppFeedbackStatus.MissingArguments).send({
        message: 'App Feedback logging failed: missing parameter(s).',
      });
    }
    let appFeedback: AppFeedbackDocument | null = null;
    let logFileString: string | null = null;
    for (const file of req.files) {
      if (file['fieldname'] === 'logFile') {
        logFileString = file['buffer'].toString();
      } else if (file['fieldname'] === 'appFeedback') {
        appFeedback = ModelHelper.decodeAppFeedback(
          JSON.parse(file['buffer'].toString())
        );
      }
    }
    if (!appFeedback) {
      return res.status(LogAppFeedbackStatus.InvalidAppFeedback).send({
        message: 'App Feedback logging failed: could not be deserialized.',
      });
    }
    if (req.token && req.token._id && mongoose.isValidObjectId(req.token._id)) {
      appFeedback.user = new mongoose.Types.ObjectId(req.token._id);
    }
    try {
      const savedFeedback = await appFeedback.save();
      if (!savedFeedback) {
        return res.status(LogAppFeedbackStatus.InternalError).send({
          message: 'App Feedback logging failed: failed to save.',
        });
      }
      const logPath = path.join(
        global.appRoot,
        'data',
        'appFeedback',
        savedFeedback._id.toString() + '.log'
      );
      // with log file
      if (logFileString && savedFeedback.includeLogFile) {
        try {
          await fs.promises.writeFile(logPath, logFileString);
          return res
            .status(LogAppFeedbackStatus.Logged)
            .send({ message: 'App Feedback logged.' });
        } catch (err) {
          logger.error(err);
          return res.status(LogAppFeedbackStatus.InternalError).send({
            message: 'App Feedback logging failed: failed to save. (error)',
          });
        }
      } else {
        // without log file
        return res
          .status(LogAppFeedbackStatus.Logged)
          .send({ message: 'App Feedback logged.' });
      }
    } catch (err) {
      logger.error(err);
      return res.status(LogAppFeedbackStatus.InternalError).send({
        message: 'App Feedback logging failed: failed to save. (error)',
      });
    }
  },
  getAppFeedback: async function (
    req: Express.AuthenticatedRequest,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: 'Cannot view app feedback: only teachers are authorized.',
      });
    }
    try {
      const appFeedbacks = await AppFeedbackModel.find()
        .populate('user', 'username role')
        .lean()
        .exec();
      return res.status(GetAppFeedbackStatus.Retrieved).send({
        appFeedback: appFeedbacks,
        message: 'App Feedback retrieved.',
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetAppFeedbackStatus.InternalError).send({
        message: 'App Feedback fetching failed (error).',
      });
    }
  },
};

export default functions;
