var mongoose = require("mongoose");
const { DateTime } = require("luxon");
const logger = require("../middleware/logger");
const FSRSModel = require("../models/fsrsModel");
const EbisuModel = require("../models/ebisuModel");
const ActivityUserAnswer = require("../models/logs/activityUserAnswer");

// Possible status codes
const SyncFSRSModelsStatus = Object.freeze({
  Synched: 200,
  MissingArguments: 400,
  InternalError: 500,
});
const SyncEbisuModelsStatus = Object.freeze({
  Synched: 200,
  MissingArguments: 400,
  InternalError: 500,
});
const SyncActivityUserAnswersStatus = Object.freeze({
  Synched: 200,
  MissingArguments: 400,
  InternalError: 500,
});

const CheckActivityUserAnswersLoggingStatus = Object.freeze({
  Checked: 200,
  MissingArguments: 400,
  InternalError: 500,
});

var functions = {
  syncFSRSModels: async function (req, res) {
    if (!req.body.fsrsModels) {
      return res
        .status(SyncFSRSModelsStatus.MissingArguments)
        .send({ message: "FSRS model sync failed: missing argument." });
    }

    try {
      const userId = new mongoose.Types.ObjectId(String(req.token._id));
      const fsrsModelsJSON = JSON.parse(req.body.fsrsModels);
      const fsrsModels = [];

      for (let i in fsrsModelsJSON) {
        fsrsModelsJSON[i]["user"] = userId;
        try {
          fsrsModels.push(new FSRSModel(fsrsModelsJSON[i]));
        } catch (err) {
          logger.error("Failed to decode FSRS model in syncFSRSModels: " + err);
        }
      }

      // Optimization: only fetch FSRS models for the given data IDS (activity / topic)
      let dataIds = [];
      if (req.body.dataIds && req.body.dataIds.length > 0) {
        try {
          dataIds = JSON.parse(req.body.dataIds).map(
            (id) => new mongoose.Types.ObjectId(String(id)),
          );
        } catch (err) {
          logger.error(
            "Failed to decode data IDs for FSRS models in syncFSRSModels: " +
              err,
          );
        }
      }

      const conditions = { user: userId };
      if (dataIds.length > 0) {
        conditions.dataId = { $in: dataIds };
      }

      const dbFSRSModels = await FSRSModel.find(conditions).lean();

      const fsrsModelsToUpdateOnServer = [];
      const fsrsModelsToSendToClient = [];
      const clientModelsMap = new Map(
        fsrsModels.map((m) => [`${m.dataId}_${m.dataType}`, m]),
      );

      for (let dbFSRSModel of dbFSRSModels) {
        const key = `${dbFSRSModel.dataId}_${dbFSRSModel.dataType}`;
        const fsrsModel = clientModelsMap.get(key);

        if (fsrsModel) {
          const dbFSRSModelLastReviewDate = DateTime.fromJSDate(
            dbFSRSModel.reviewLog.review,
            { zone: "utc" },
          );
          const fsrsModelLastReviewDate = DateTime.fromJSDate(
            fsrsModel.reviewLog.review,
            { zone: "utc" },
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

      const serverOperations = [];
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
        delete updatedFSRSModel._id;

        serverOperations.push({
          updateOne: {
            filter: {
              dataId: fsrsModel.dataId,
              dataType: fsrsModel.dataType,
              user: userId,
            },
            update: updatedFSRSModel,
          },
        });
      }

      if (serverOperations.length === 0) {
        return res.status(SyncFSRSModelsStatus.Synched).send({
          message: "FSRS models synchronized.",
          fsrsModels: JSON.parse(JSON.stringify(fsrsModelsToSendToClient)),
          insertedCount: 0,
          updatedCount: 0,
        });
      }

      const result = await FSRSModel.bulkWrite(serverOperations);
      return res.status(SyncFSRSModelsStatus.Synched).send({
        message: "FSRS models synchronized.",
        fsrsModels: JSON.parse(JSON.stringify(fsrsModelsToSendToClient)),
        insertedCount: result.insertedCount,
        updatedCount: result.modifiedCount,
      });
    } catch (err) {
      logger.error(err);
      return res.status(SyncFSRSModelsStatus.InternalError).send({
        message: "FSRS model sync failed: an error occurred.",
      });
    }
  },
  // DEPRECATED: replaced by FSRS.
  // Function and associated endpoint are left enabled in case of older client versions still being in use.
  syncEbisuModels: function (req, res) {
    if (!req.body.ebisuModels) {
      res
        .status(SyncEbisuModelsStatus.MissingArguments)
        .send({ message: "Ebisu model sync failed: missing argument." });
      return;
    }
    const userId = new mongoose.Types.ObjectId(String(req.token._id));
    const ebisuModelsJSON = JSON.parse(req.body.ebisuModels);
    var ebisuModels = [];
    for (let i in ebisuModelsJSON) {
      ebisuModelsJSON[i]["user"] = userId;
      try {
        ebisuModels.push(new EbisuModel(ebisuModelsJSON[i]));
      } catch (err) {
        logger.error("Failed to decode ebisu model in syncEbisuModels: " + err);
      }
    }

    EbisuModel.find({ user: userId })
      .exec()
      .then((dbEbisuModels) => {
        var ebisuModelsToUpdateOnServer = [];
        var ebisuModelsToSendToClient = [];
        for (let i in dbEbisuModels) {
          let dbEbisuModel = dbEbisuModels[i];
          let exists = false;
          for (let j in ebisuModels) {
            let ebisuModel = ebisuModels[j];
            if (
              dbEbisuModel.dataId === ebisuModel.dataId &&
              dbEbisuModel.dataType === ebisuModel.dataType
            ) {
              exists = true;
              let dbEbisuModelLastUpdatedDate = DateTime.fromJSDate(
                dbEbisuModel.lastUpdatedDate,
                { zone: "utc" },
              );
              let ebisuModelLastUpdatedDate = DateTime.fromJSDate(
                ebisuModel.lastUpdatedDate,
                { zone: "utc" },
              );
              /// Client has newer version, update on server
              if (dbEbisuModelLastUpdatedDate < ebisuModelLastUpdatedDate) {
                ebisuModelsToUpdateOnServer.push(ebisuModel);
              } else if (
                dbEbisuModelLastUpdatedDate > ebisuModelLastUpdatedDate
              ) {
                /// Server has newer version, send to client
                ebisuModelsToSendToClient.push(dbEbisuModel);
              }
              ebisuModels.splice(j, 1);
              break;
            }
          }
          /// Server has ebisu model not stored by client, send to client
          if (!exists) {
            ebisuModelsToSendToClient.push(dbEbisuModel);
          }
        }
        let serverOperations = [];
        /// TODO: some code reuse possible with storeEbisuModels function in ebisuActions.js
        /// All models from client not found in server database to be stored in server database
        for (let i in ebisuModels) {
          let ebisuModel = ebisuModels[i];
          serverOperations.push({ insertOne: { document: ebisuModel } });
        }
        /// All newer models from client to update on server
        for (let i in ebisuModelsToUpdateOnServer) {
          let ebisuModel = ebisuModelsToUpdateOnServer[i];
          /// Manually raise version number
          ebisuModel.version++;
          /// updateOne operation expects JS object or string, NOT mongoose object!
          let updatedEbisuModel = ebisuModel.toObject();
          /// updateOne breaks with _id included in document as it is an immutable field
          delete updatedEbisuModel._id;
          serverOperations.push({
            updateOne: {
              filter: {
                $and: [
                  { dataId: ebisuModel.dataId },
                  { dataType: ebisuModel.dataType },
                  { user: userId },
                  // Is this filter needed?
                  // {
                  //   lastUpdatedDate: {
                  //     $lt: ebisuModel.lastUpdatedDate,
                  //   },
                  // },
                ],
              },
              update: updatedEbisuModel,
            },
          });
        }
        if (serverOperations.length === 0) {
          res.status(SyncEbisuModelsStatus.Synched).send({
            message: "Ebisu models synchronized.",
            ebisuModels: JSON.parse(JSON.stringify(ebisuModelsToSendToClient)),
            insertedCount: 0,
            updatedCount: 0,
          });
          return;
        } else {
          EbisuModel.bulkWrite(serverOperations)
            .then((result) => {
              // logger.info(
              //   "(Sync) Ebisu models stored: " +
              //     result.insertedCount +
              //     " inserted, " +
              //     result.modifiedCount +
              //     " updated."
              // );
              res.status(SyncEbisuModelsStatus.Synched).send({
                message: "Ebisu models synchronized.",
                ebisuModels: JSON.parse(
                  JSON.stringify(ebisuModelsToSendToClient),
                ),
                insertedCount: result.insertedCount,
                updatedCount: result.modifiedCount,
              });
            })
            .catch((err) => {
              logger.error(err);
              res.status(SyncEbisuModelsStatus.InternalError).send({
                message:
                  "An error occurred while writing the insertions and updates of ebisu models during sync.",
              });
            });
        }
      })
      .catch((err) => {
        logger.error(err);
        res.status(SyncEbisuModelsStatus.InternalError).send({
          message:
            "Ebisu model sync failed: an error occurred while searching for user's ebisu models.",
        });
        return;
      });
  },
  checkActivityUserAnswersLoggingByTimestamp: async function (req, res) {
    if (
      !req.body.activityUserAnswerTimestamps ||
      req.body.activityUserAnswerTimestamps.length == 0
    ) {
      return res
        .status(CheckActivityUserAnswersLoggingStatus.MissingArguments)
        .send({
          message:
            "Activity user answer logging check failed: missing argument.",
        });
    }
    const userId = new mongoose.Types.ObjectId(String(req.token._id));
    const activityUserAnswerTimestamps = JSON.parse(
      req.body.activityUserAnswerTimestamps,
    ).map((elem) => DateTime.fromISO(elem));
    try {
      let result = await ActivityUserAnswer.base
        .find(
          {
            user: userId,
            timestamp: { $in: activityUserAnswerTimestamps },
          },
          "timestamp -_id",
        )
        .lean();
      if (result) {
        // Use Set rather than array for O(1) lookups - Set uses hash table internally when using has() method.
        const foundTimestampsSet = new Set(
          result.map((elem) => DateTime.fromJSDate(elem.timestamp).toISO()),
        );
        const nonLoggedAnswerTimestamps = activityUserAnswerTimestamps
          .map((dt) => dt.toISO())
          .filter((x) => !foundTimestampsSet.has(x));

        if (nonLoggedAnswerTimestamps.length > 0) {
          return res
            .status(CheckActivityUserAnswersLoggingStatus.Checked)
            .json({
              message: "Activity user answers logging checked by timestamp.",
              timestamps: JSON.parse(JSON.stringify(nonLoggedAnswerTimestamps)),
            });
        } else {
          return res
            .status(CheckActivityUserAnswersLoggingStatus.Checked)
            .json({
              message:
                "Activity user answers logging checked by timestamp: all are logged.",
              timestamps: [],
            });
        }
      } else {
        return res.status(CheckActivityUserAnswersLoggingStatus.Checked).json({
          message: "Activity user answers logging checked by timestamp.",
          timestamps: JSON.parse(JSON.stringify(activityUserAnswerTimestamps)),
        });
      }
    } catch (err) {
      logger.error(err);
      return res
        .status(CheckActivityUserAnswersLoggingStatus.InternalError)
        .send({
          message:
            "Activity user answers logging check by timestamp failed: an error occurred (ERR1).",
        });
    }
  },
  syncActivityUserAnswers: async function (req, res) {
    if (!req.body.activityUserAnswers || !req.body.activityIds) {
      return res.status(SyncActivityUserAnswersStatus.MissingArguments).send({
        message: "Activity user answers sync failed: missing argument.",
      });
    }
    const userId = new mongoose.Types.ObjectId(String(req.token._id));
    const activityIdsJSON = JSON.parse(req.body.activityIds);
    let activityIds = [];
    for (let activityID of activityIdsJSON) {
      try {
        activityIds.push(new mongoose.Types.ObjectId(String(activityID)));
      } catch (err) {
        logger.error(err);
      }
    }
    const activityUserAnswersJSON = JSON.parse(req.body.activityUserAnswers);
    const existingActivityAnswersDictionary = new Map();
    for (const [key, value] of Object.entries(activityUserAnswersJSON)) {
      existingActivityAnswersDictionary.set(
        key,
        DateTime.fromISO(value, {
          zone: "utc",
        }),
      );
    }
    try {
      let result = await ActivityUserAnswer.base
        .aggregate([
          {
            $match: {
              $and: [{ user: userId }, { activity: { $in: activityIds } }],
            },
          },
          { $sort: { timestamp: -1 } },
          // Get the latest answer for each unique activity
          { $group: { _id: "$activity", latest: { $first: "$$ROOT" } } },
          // exclude _id from root object and project each found activity answer to field name "activityAnswer"
          { $project: { _id: 0, activityAnswer: "$latest" } },
          // Flatten result array
          { $unwind: "$activityAnswer" },
          {
            $replaceRoot: {
              newRoot: "$activityAnswer",
            },
          },
          // CRITICAL: exclude user field as the client cannot decode it unless it is a map containing the username and role
          { $unset: ["user"] },
        ])
        .exec();
      if (!result || result.length === 0) {
        return res.status(SyncActivityUserAnswersStatus.Synched).send({
          message: "Activity user answers are already synchronized.",
          activityUserAnswers: [],
        });
      } else {
        var filteredResult = [];
        for (let activityAnswer of result) {
          if (
            existingActivityAnswersDictionary.has(
              activityAnswer.activity.toString(),
            )
          ) {
            let activityAnswerTimestamp = DateTime.fromJSDate(
              activityAnswer.timestamp,
              { zone: "utc" },
            );
            if (
              activityAnswerTimestamp >
              existingActivityAnswersDictionary.get(
                activityAnswer.activity.toString(),
              )
            ) {
              filteredResult.push(activityAnswer);
            }
          } else {
            filteredResult.push(activityAnswer);
          }
        }
        return res.status(SyncActivityUserAnswersStatus.Synched).json({
          message: "Activity user answers synched.",
          activityUserAnswers: JSON.parse(JSON.stringify(filteredResult)),
        });
      }
    } catch (err) {
      logger.error(err);
      return res.status(SyncActivityUserAnswersStatus.InternalError).send({
        message: "Activity answers sync failed: an error occurred (error).",
      });
    }
  },
};

module.exports = functions;
