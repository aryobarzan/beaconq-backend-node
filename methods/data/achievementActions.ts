import { Response } from 'express';
import ModelHelper from '../../middleware/modelHelper';
import logger from '../../middleware/logger';
import mongoose from 'mongoose';
import {
  AchievementDocument,
  AchievementModel,
} from '../../models/achievement';
import {
  UserAchievementDocument,
  UserAchievementModel,
} from '../../models/userAchievement';

// Possible status codes
enum CreateAchievementsStatus {
  Created = 200,
  None = 209,
  MissingArguments = 400,
  Unauthorized = 403,
  InternalError = 500,
}
enum GetAchievementsStatus {
  Retrieved = 200,
  NoAchievements = 209,
  MissingArguments = 400,
  InternalError = 500,
}
enum GetUserAchievementsStatus {
  Retrieved = 200,
  NoUserAchievements = 209,
  MissingArguments = 400,
  InternalError = 500,
}
enum UpdateUserAchievementsStatus {
  Updated = 200,
  None = 209,
  MissingArguments = 400,
  InternalError = 500,
}
// Possible status codes

const functions = {
  createAchievements: async function (
    req: Express.AuthenticatedRequest,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res
        .status(CreateAchievementsStatus.Unauthorized)
        .send({ message: 'You are not authorized to perform this action.' });
    }

    if (!req.body.achievements) {
      return res
        .status(CreateAchievementsStatus.MissingArguments)
        .send({ message: 'Please indicate the achievements to create.' });
    }

    let achievementsRaw: any;
    try {
      achievementsRaw = JSON.parse(req.body.achievements);
    } catch (err: unknown) {
      logger.error(`createAchievements: invalid JSON: ${err}`);
      return res
        .status(CreateAchievementsStatus.MissingArguments)
        .send({ message: 'Invalid achievements JSON.' });
    }

    if (!Array.isArray(achievementsRaw) || achievementsRaw.length === 0) {
      return res
        .status(CreateAchievementsStatus.None)
        .send({ message: 'No achievements to create.' });
    }

    // safety limit to avoid overloading database
    const MAX_BATCH = 200;
    if (achievementsRaw.length > MAX_BATCH) {
      return res.status(CreateAchievementsStatus.MissingArguments).send({
        message: `Too many achievements; limit is ${MAX_BATCH}.`,
      });
    }

    const operations: { insertOne: { document: AchievementDocument } }[] = [];
    const decodeFailures: { index: number; item: any }[] = [];
    for (let i = 0; i < achievementsRaw.length; i++) {
      const decoded = ModelHelper.decodeAchievement(achievementsRaw[i]);
      if (!decoded) {
        decodeFailures.push({ index: i, item: achievementsRaw[i] });
        continue;
      }
      decoded.author = new mongoose.Types.ObjectId(req.token._id);

      operations.push({ insertOne: { document: decoded } });
    }

    if (operations.length === 0) {
      return res.status(CreateAchievementsStatus.None).send({
        message: 'No achievements to create (possible decode failures).',
        decodeFailures,
      });
    }

    try {
      // ordered: false, otherwise a single operation failing would abort the entire bulkWrite.
      const result = await AchievementModel.bulkWrite(operations, {
        ordered: false,
      });

      const inserted = result.insertedIds
        ? Object.values(result.insertedIds)
        : [];
      const createdIds = inserted.map((id) => String(id)).filter(Boolean); // filter out null/falsy values
      const writeErrors =
        result.getWriteErrors().map((we) => ({
          index: we.index,
          code: we.code,
          errmsg: we.errmsg || we.err || String(we),
        })) || [];

      return res.status(CreateAchievementsStatus.Created).send({
        message: 'Created achievements.',
        createdCount: result.insertedCount || createdIds.length,
        createdIds,
        writeErrorCount: result.getWriteErrorCount() || writeErrors.length,
        writeErrors,
        decodeFailures,
      });
    } catch (err: unknown) {
      logger.error(`createAchievements failed: ${err}`);

      // in case of BulkWriteError, extract partial results
      if (
        err &&
        err instanceof mongoose.mongo.MongoBulkWriteError &&
        err.result &&
        err.result.insertedIds
      ) {
        const inserted = Object.values(err.result.insertedIds) || [];
        const createdIds = inserted.map((id) => String(id)).filter(Boolean); // filter out null/falsy values
        const writeErrors =
          err.result.getWriteErrors().map((we) => ({
            index: we.index,
            code: we.code,
            errmsg: we.errmsg || we.err || String(we),
          })) || [];

        return res.status(CreateAchievementsStatus.Created).send({
          message: 'Created achievements (partial success).',
          createdCount: createdIds.length,
          createdIds,
          writeErrorCount: writeErrors.length,
          writeErrors,
          decodeFailures,
        });
      }

      return res
        .status(CreateAchievementsStatus.InternalError)
        .send({ message: 'Failed to create achievements. (ERR301)' });
    }
  },
  getAchievements: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { courseIds: string; excludeGlobal: boolean }
    >,
    res: Response
  ) {
    let courseIds: mongoose.Types.ObjectId[] = [];
    if (req.body.courseIds) {
      let courseIdsRaw: any;
      try {
        courseIdsRaw = JSON.parse(req.body.courseIds);
        if (!Array.isArray(courseIdsRaw)) {
          return res.status(GetAchievementsStatus.MissingArguments).send({
            message:
              'Achievement retrieval failed: courseIds must be an array. (ERR200)',
          });
        }
      } catch (_: unknown) {
        return res
          .status(GetAchievementsStatus.MissingArguments)
          .send({ message: 'Achievement retrieval failed. (ERR201)' });
      }
      // retain only valid course IDs
      courseIds = courseIdsRaw
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
    }
    let excludeGlobal =
      req.body.excludeGlobal === true ||
      String(req.body.excludeGlobal) === 'true';
    let condition =
      !courseIds || courseIds.length === 0
        ? { course: null }
        : excludeGlobal
          ? { course: { $in: courseIds } }
          : {
              $or: [{ course: { $in: courseIds } }, { course: null }],
            };
    try {
      const achievements = await AchievementModel.find(condition).lean().exec();
      if (!achievements || achievements.length === 0) {
        return res
          .status(GetAchievementsStatus.NoAchievements)
          .send({ message: 'No achievements available.', achievements: [] });
      }
      return res.status(GetAchievementsStatus.Retrieved).send({
        message: 'Achievements retrieved.',
        achievements: achievements,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(GetAchievementsStatus.InternalError)
        .send({ message: 'Achievement retrieval failed. (ERR204)' });
    }
  },
  getUserAchievements: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { userId: string; achievementIds: string }
    >,
    res: Response
  ) {
    // By default, the requester wants to fetch their own achievements
    let userId = new mongoose.Types.ObjectId(req.token._id);
    // Teacher wants to look up a user's achievements
    if (req.body.userId && req.token.role === UserRole.TEACHER) {
      try {
        userId = new mongoose.Types.ObjectId(req.body.userId);
      } catch (err: unknown) {
        logger.error(
          `Failed to parse custom user id for getUserAchievements: ${err}`
        );
        return res
          .status(GetUserAchievementsStatus.MissingArguments)
          .send({ message: 'User achievement retrieval failed. (ERR200)' });
      }
    }
    let achievementIds: mongoose.Types.ObjectId[] = [];
    if (req.body.achievementIds) {
      let achievementIdsRaw: any;
      try {
        achievementIdsRaw = JSON.parse(req.body.achievementIds);
        if (!Array.isArray(achievementIdsRaw)) {
          return res.status(GetUserAchievementsStatus.MissingArguments).send({
            message:
              'User achievement retrieval failed: achievementIds must be an array. (ERR201)',
          });
        }
      } catch (_: unknown) {
        return res
          .status(GetUserAchievementsStatus.MissingArguments)
          .send({ message: 'User achievement retrieval failed. (ERR202)' });
      }
      // retain only valid achievement IDs
      achievementIds = achievementIdsRaw
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

      // safety limit to avoid overloading database
      const MAX_BATCH = 200;
      if (achievementIds.length > MAX_BATCH) {
        return res.status(GetUserAchievementsStatus.MissingArguments).send({
          message: `Too many achievement IDs to retrieve; limit is ${MAX_BATCH}.`,
        });
      }
    }

    let condition =
      !achievementIds || achievementIds.length === 0
        ? { user: userId }
        : {
            $and: [{ achievement: { $in: achievementIds } }, { user: userId }],
          };
    try {
      const userAchievements = await UserAchievementModel.find(condition)
        .lean()
        .exec();
      if (!userAchievements || userAchievements.length === 0) {
        return res.status(GetUserAchievementsStatus.NoUserAchievements).send({
          message: 'No user achievements available.',
          achievements: [],
        });
      }
      return res.status(GetUserAchievementsStatus.Retrieved).send({
        message: 'User achievements retrieved.',
        achievements: userAchievements,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(GetUserAchievementsStatus.InternalError)
        .send({ message: 'User achievement retrieval failed. (ERR205)' });
    }
  },
  updateUserAchievements: async function (
    req: Express.AuthenticatedRequest<{}, {}, { userAchievements: string }>,
    res: Response
  ) {
    if (!req.body.userAchievements) {
      return res.status(UpdateUserAchievementsStatus.MissingArguments).send({
        message: 'No user achievements indicated.',
      });
    }
    let receivedUserAchievementsRaw = [];
    try {
      receivedUserAchievementsRaw = JSON.parse(req.body.userAchievements);
    } catch (_: unknown) {
      return res.status(UpdateUserAchievementsStatus.MissingArguments).send({
        message: 'No user achievements indicated. (invalid json)',
      });
    }

    let receivedUserAchievements: UserAchievementDocument[] = [];
    for (let receivedUserAchievementRaw of receivedUserAchievementsRaw) {
      const userAchievement = ModelHelper.decodeUserAchievement(
        receivedUserAchievementRaw
      );
      if (userAchievement) {
        userAchievement.user = new mongoose.Types.ObjectId(req.token._id);

        receivedUserAchievements.push(userAchievement);
      }
    }

    // remove duplicates
    const uniqueMap = new Map();
    for (const receivedUserAchievement of receivedUserAchievements) {
      if (
        !receivedUserAchievement.achievement ||
        !receivedUserAchievement.user
      ) {
        continue;
      }
      const ach = String(receivedUserAchievement.achievement);
      const user = String(receivedUserAchievement.user);
      const key = `${ach}::${user}`;
      // overwrite so last occurrence wins
      uniqueMap.set(key, receivedUserAchievement);
    }
    receivedUserAchievements = Array.from(uniqueMap.values());

    if (receivedUserAchievements.length === 0) {
      return res.status(UpdateUserAchievementsStatus.MissingArguments).send({
        message: 'No user achievements indicated. (invalid achievements)',
      });
    }

    const operations: {
      updateOne: {
        filter: {
          $and: [
            { achievement: mongoose.Types.ObjectId },
            { user: mongoose.Types.ObjectId },
          ];
        };
        update: { $set: any };
        upsert: true;
      };
    }[] = [];
    for (let receivedUserAchievement of receivedUserAchievements) {
      let userAchievementObject = receivedUserAchievement.toObject();
      const { _id, ...userAchievementObjectWithoutId } = userAchievementObject;
      operations.push({
        updateOne: {
          filter: {
            $and: [
              { achievement: receivedUserAchievement.achievement },
              { user: receivedUserAchievement.user },
            ],
          },
          update: { $set: userAchievementObjectWithoutId }, // $set ensures only the given fields present in userAchievementObject are updated in the found document.
          upsert: true,
        },
      });
    }
    if (operations.length === 0) {
      return res
        .status(UpdateUserAchievementsStatus.None)
        .send({ message: 'No user achievements to update.' });
    }
    try {
      // "ordered: false" to avoid a single write failure aborting the entire bulkWrite operation
      const result = await UserAchievementModel.bulkWrite(operations, {
        ordered: false,
      });
      let insertedIds: string[] = Object.values(result.upsertedIds) || [];
      insertedIds = insertedIds.map((u) => String(u)).filter(Boolean);

      const modifiedIds = receivedUserAchievements
        .filter((elem) => elem._id)
        .map((elem) => String(elem._id))
        .filter((id) => !insertedIds.includes(id));

      const allIds = [...insertedIds, ...modifiedIds].map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      if (allIds.length === 0) {
        return res.status(UpdateUserAchievementsStatus.Updated).send({
          message: 'User achievements updated (None).',
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          writeErrorCount: result.getWriteErrorCount(),
        });
      }
      try {
        const updatedUserAchievements = await UserAchievementModel.find({
          _id: { $in: allIds },
        })
          .lean()
          .exec();
        return res.status(UpdateUserAchievementsStatus.Updated).send({
          message: 'User achievements updated.',
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          writeErrorCount: result.getWriteErrorCount(),
          userAchievements: updatedUserAchievements,
        });
      } catch (err: unknown) {
        logger.error(err);
        return res.status(UpdateUserAchievementsStatus.Updated).send({
          message: 'User achievements updated, but failed to retrieve them.',
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          writeErrorCount: result.getWriteErrorCount(),
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(UpdateUserAchievementsStatus.InternalError)
        .send({ message: 'Failed to update user achievements. (ERR941)' });
    }
  },
};

export default functions;
