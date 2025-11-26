import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import logger from '../middleware/logger';
import { FSRSDocument, FSRSModel } from '../models/fsrsModel';
import {
  ActivityUserAnswerDocument,
  ActivityUserAnswerModel,
} from '../models/logs/activityUserAnswer';
import { Response } from 'express';

// Possible status codes
enum SyncFSRSModelsStatus {
  Synched = 200,
  MissingArguments = 400,
  InternalError = 500,
}

enum SyncActivityUserAnswersStatus {
  Synched = 200,
  MissingArguments = 400,
  InternalError = 500,
}
enum CheckActivityUserAnswersLoggingStatus {
  Checked = 200,
  MissingArguments = 400,
  InternalError = 500,
}

const functions = {
  syncFSRSModels: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { fsrsModels: string; dataIds?: string }
    >,
    res: Response
  ) {
    if (!req.body.fsrsModels) {
      return res
        .status(SyncFSRSModelsStatus.MissingArguments)
        .send({ message: 'FSRS model sync failed: missing argument.' });
    }

    try {
      const userId = new mongoose.Types.ObjectId(req.token._id);
      const fsrsModelsJSON = JSON.parse(req.body.fsrsModels);
      const fsrsModels: FSRSDocument[] = [];

      for (let i in fsrsModelsJSON) {
        fsrsModelsJSON[i]['user'] = userId;
        try {
          fsrsModels.push(new FSRSModel(fsrsModelsJSON[i]));
        } catch (err: unknown) {
          logger.error('Failed to decode FSRS model in syncFSRSModels: ' + err);
        }
      }

      // Optimization: only fetch FSRS models for the given data IDS (activity / topic)
      let dataIds: mongoose.Types.ObjectId[] = [];
      if (req.body.dataIds) {
        try {
          const dataIdsRaw = JSON.parse(req.body.dataIds);
          dataIds = Array.isArray(dataIdsRaw)
            ? dataIdsRaw.map(
                (id: any) => new mongoose.Types.ObjectId(String(id))
              )
            : [];
        } catch (err: unknown) {
          logger.error(
            'Failed to decode data IDs for FSRS models in syncFSRSModels: ' +
              err
          );
        }
      }

      const conditions = {};
      conditions['user'] = userId;
      if (dataIds.length > 0) {
        conditions['dataId'] = { $in: dataIds };
      }

      const dbFSRSModels = await FSRSModel.find(conditions).lean();

      const fsrsModelsToUpdateOnServer: FSRSDocument[] = [];
      const fsrsModelsToSendToClient: FSRSDocument[] = [];
      const clientModelsMap = new Map(
        fsrsModels.map((m) => [`${m.dataId}_${m.dataType}`, m])
      );

      for (let dbFSRSModel of dbFSRSModels) {
        const key = `${dbFSRSModel.dataId}_${dbFSRSModel.dataType}`;
        const fsrsModel = clientModelsMap.get(key);

        if (fsrsModel) {
          const dbFSRSModelLastReviewDate = DateTime.fromJSDate(
            dbFSRSModel.reviewLog.review,
            { zone: 'utc' }
          );
          const fsrsModelLastReviewDate = DateTime.fromJSDate(
            fsrsModel.reviewLog.review,
            { zone: 'utc' }
          );

          // Client has newer version, update on server
          if (dbFSRSModelLastReviewDate < fsrsModelLastReviewDate) {
            fsrsModelsToUpdateOnServer.push(fsrsModel);
          } else if (dbFSRSModelLastReviewDate > fsrsModelLastReviewDate) {
            // Server has newer version, send to client
            fsrsModelsToSendToClient.push(dbFSRSModel);
          }

          clientModelsMap.delete(key);
        } else {
          // Server has FSRS model not stored by client, send to client
          fsrsModelsToSendToClient.push(dbFSRSModel);
        }
      }

      const serverOperations: any[] = [];
      /// TODO: some code reuse possible with storeFSRSModels function in fsrsActions.js

      // All models from client not found in server database to be stored in server database
      for (let fsrsModel of clientModelsMap.values()) {
        serverOperations.push({ insertOne: { document: fsrsModel } });
      }

      // All newer models from client to update on server
      for (let fsrsModel of fsrsModelsToUpdateOnServer) {
        // Manually raise version number
        fsrsModel.version++;
        // updateOne operation expects JS object or string, NOT mongoose object!
        const updatedFSRSModel = fsrsModel.toObject();
        // updateOne breaks with _id included in document as it is an immutable field
        const { _id, ...updatedFSRSModelWithoutId } = updatedFSRSModel;

        serverOperations.push({
          updateOne: {
            filter: {
              dataId: fsrsModel.dataId,
              dataType: fsrsModel.dataType,
              user: userId,
            },
            update: updatedFSRSModelWithoutId,
          },
        });
      }

      if (serverOperations.length === 0) {
        return res.status(SyncFSRSModelsStatus.Synched).send({
          message: 'FSRS models synchronized.',
          fsrsModels: JSON.parse(JSON.stringify(fsrsModelsToSendToClient)),
          insertedCount: 0,
          updatedCount: 0,
        });
      }

      const result = await FSRSModel.bulkWrite(serverOperations);
      return res.status(SyncFSRSModelsStatus.Synched).send({
        message: 'FSRS models synchronized.',
        fsrsModels: JSON.parse(JSON.stringify(fsrsModelsToSendToClient)),
        insertedCount: result.insertedCount,
        updatedCount: result.modifiedCount,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(SyncFSRSModelsStatus.InternalError).send({
        message: 'FSRS model sync failed: an error occurred.',
      });
    }
  },
  // DEPRECATED: replaced by FSRS.
  // For backwards compatibility, this funtion now just sends back a generic response.
  syncEbisuModels: function (_: Express.AuthenticatedRequest, res: Response) {
    res.status(200).send({
      message: 'Ebisu models synchronized.',
      ebisuModels: [],
      insertedCount: 0,
      updatedCount: 0,
    });
  },
  checkActivityUserAnswersLoggingByTimestamp: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { activityUserAnswerTimestamps: string }
    >,
    res: Response
  ) {
    if (!req.body.activityUserAnswerTimestamps) {
      return res
        .status(CheckActivityUserAnswersLoggingStatus.MissingArguments)
        .send({
          message:
            'Activity user answer logging check failed: missing argument.',
        });
    }
    const userId = new mongoose.Types.ObjectId(req.token._id);
    let activityUserAnswerTimestampsRaw: any[];
    try {
      activityUserAnswerTimestampsRaw = JSON.parse(
        req.body.activityUserAnswerTimestamps
      );
    } catch (_: unknown) {
      return res
        .status(CheckActivityUserAnswersLoggingStatus.MissingArguments)
        .send({
          message:
            'Activity user answer logging check failed: missing argument.',
        });
    }
    const activityUserAnswerTimestamps = Array.isArray(
      activityUserAnswerTimestampsRaw
    )
      ? activityUserAnswerTimestampsRaw.map((elem) =>
          DateTime.fromISO(elem).toJSDate()
        )
      : [];
    try {
      let result = await ActivityUserAnswerModel.find(
        {
          user: userId,
          timestamp: {
            $in: activityUserAnswerTimestamps,
          },
        },
        'timestamp -_id'
      )
        .lean()
        .exec();
      if (result) {
        // Use Set rather than array for O(1) lookups - Set uses hash table internally when using has() method.
        const foundTimestampsSet = new Set(
          result.map((elem) => DateTime.fromJSDate(elem.timestamp).toISO())
        );
        const nonLoggedAnswerTimestamps = activityUserAnswerTimestamps
          .map((dt) => DateTime.fromJSDate(dt).toISO())
          .filter((x) => !foundTimestampsSet.has(x));

        if (nonLoggedAnswerTimestamps.length > 0) {
          return res
            .status(CheckActivityUserAnswersLoggingStatus.Checked)
            .json({
              message: 'Activity user answers logging checked by timestamp.',
              timestamps: JSON.parse(JSON.stringify(nonLoggedAnswerTimestamps)),
            });
        } else {
          return res
            .status(CheckActivityUserAnswersLoggingStatus.Checked)
            .json({
              message:
                'Activity user answers logging checked by timestamp: all are logged.',
              timestamps: [],
            });
        }
      } else {
        return res.status(CheckActivityUserAnswersLoggingStatus.Checked).json({
          message: 'Activity user answers logging checked by timestamp.',
          timestamps: JSON.parse(JSON.stringify(activityUserAnswerTimestamps)),
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(CheckActivityUserAnswersLoggingStatus.InternalError)
        .send({
          message:
            'Activity user answers logging check by timestamp failed: an error occurred (ERR1).',
        });
    }
  },
  syncActivityUserAnswers: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { activityUserAnswers: string; activityIds: string }
    >,
    res: Response
  ) {
    if (!req.body.activityUserAnswers || !req.body.activityIds) {
      return res.status(SyncActivityUserAnswersStatus.MissingArguments).send({
        message: 'Activity user answers sync failed: missing argument.',
      });
    }
    const userId = new mongoose.Types.ObjectId(req.token._id);
    let activityIdsRaw: any;

    try {
      activityIdsRaw = JSON.parse(req.body.activityIds);
    } catch (_: unknown) {
      return res.status(SyncActivityUserAnswersStatus.MissingArguments).send({
        message:
          'Activity user answers sync failed: missing argument (invalid json).',
      });
    }

    let activityIds: mongoose.Types.ObjectId[] = Array.isArray(activityIdsRaw)
      ? activityIdsRaw
          .filter((a) => mongoose.isValidObjectId(a))
          .map((a) => new mongoose.Types.ObjectId(String(a)))
      : [];

    let activityUserAnswersRaw: any;
    try {
      activityUserAnswersRaw = JSON.parse(req.body.activityUserAnswers);
    } catch (_: unknown) {
      return res.status(SyncActivityUserAnswersStatus.MissingArguments).send({
        message:
          'Activity user answers sync failed: missing argument (invalid json).',
      });
    }
    const activityUserAnswersArray: string[] = Array.isArray(
      activityUserAnswersRaw
    )
      ? activityUserAnswersRaw
      : [];
    const existingActivityAnswersDictionary = new Map();
    for (const [key, value] of Object.entries(activityUserAnswersArray)) {
      existingActivityAnswersDictionary.set(
        key,
        DateTime.fromISO(value, {
          zone: 'utc',
        })
      );
    }
    try {
      let result = await ActivityUserAnswerModel.aggregate([
        {
          $match: {
            $and: [{ user: userId }, { activity: { $in: activityIds } }],
          },
        },
        { $sort: { timestamp: -1 } },
        // Get the latest answer for each unique activity
        { $group: { _id: '$activity', latest: { $first: '$$ROOT' } } },
        // exclude _id from root object and project each found activity answer to field name "activityAnswer"
        { $project: { _id: 0, activityAnswer: '$latest' } },
        // Flatten result array
        { $unwind: '$activityAnswer' },
        {
          $replaceRoot: {
            newRoot: '$activityAnswer',
          },
        },
        // CRITICAL: exclude user field as the client cannot decode it unless it is a map containing the username and role
        { $unset: ['user'] },
      ]).exec();
      if (!result || result.length === 0) {
        return res.status(SyncActivityUserAnswersStatus.Synched).send({
          message: 'Activity user answers are already synchronized.',
          activityUserAnswers: [],
        });
      } else {
        var filteredResult: ActivityUserAnswerDocument[] = [];
        for (let activityAnswer of result) {
          if (
            existingActivityAnswersDictionary.has(
              activityAnswer.activity.toString()
            )
          ) {
            let activityAnswerTimestamp = DateTime.fromJSDate(
              activityAnswer.timestamp,
              { zone: 'utc' }
            );
            if (
              activityAnswerTimestamp >
              existingActivityAnswersDictionary.get(
                activityAnswer.activity.toString()
              )
            ) {
              filteredResult.push(activityAnswer);
            }
          } else {
            filteredResult.push(activityAnswer);
          }
        }
        return res.status(SyncActivityUserAnswersStatus.Synched).json({
          message: 'Activity user answers synched.',
          activityUserAnswers: JSON.parse(JSON.stringify(filteredResult)),
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      return res.status(SyncActivityUserAnswersStatus.InternalError).send({
        message: 'Activity answers sync failed: an error occurred (error).',
      });
    }
  },
};

export default functions;
