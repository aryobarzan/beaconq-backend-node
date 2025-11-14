const ModelHelper = require("../../middleware/modelHelper");
const logger = require("../../middleware/logger");
var mongoose = require("mongoose");
const Achievement = require("../../models/achievement");
const UserAchievement = require("../../models/userAchievement");

// Possible status codes
const CreateAchievementsStatus = Object.freeze({
  Created: 200,
  None: 209,
  MissingArguments: 400,
  Unauthorized: 403,
  InternalError: 500,
});
const GetAchievementsStatus = Object.freeze({
  Retrieved: 200,
  NoAchievements: 209,
  MissingArguments: 400,
  InternalError: 500,
});
const GetUserAchievementsStatus = Object.freeze({
  Retrieved: 200,
  NoUserAchievements: 209,
  MissingArguments: 400,
  InternalError: 500,
});

const UpdateUserAchievementsStatus = Object.freeze({
  Updated: 200,
  None: 209,
  MissingArguments: 400,
  InternalError: 500,
});

// Possible status codes

var functions = {
  createAchievements: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res
        .status(CreateAchievementsStatus.Unauthorized)
        .send({ message: "You are not authorized to perform this action." });
    }

    if (!req.body.achievements) {
      return res
        .status(CreateAchievementsStatus.MissingArguments)
        .send({ message: "Please indicate the achievements to create." });
    }

    let achievementsRaw;
    try {
      achievementsRaw = JSON.parse(req.body.achievements);
    } catch (err) {
      logger.error("createAchievements: invalid JSON", err);
      return res
        .status(CreateAchievementsStatus.MissingArguments)
        .send({ message: "Invalid achievements JSON." });
    }

    if (!Array.isArray(achievementsRaw) || achievementsRaw.length === 0) {
      return res
        .status(CreateAchievementsStatus.None)
        .send({ message: "No achievements to create." });
    }

    // safety limit to avoid overloading database
    const MAX_BATCH = 200;
    if (achievementsRaw.length > MAX_BATCH) {
      return res.status(CreateAchievementsStatus.MissingArguments).send({
        message: `Too many achievements; limit is ${MAX_BATCH}.`,
      });
    }

    const operations = [];
    const decodeFailures = [];
    for (let i = 0; i < achievementsRaw.length; i++) {
      const decoded = ModelHelper.decodeAchievement(achievementsRaw[i]);
      if (!decoded) {
        decodeFailures.push({ index: i, item: achievementsRaw[i] });
        continue;
      }
      decoded.author = mongoose.Types.ObjectId(req.token._id);

      operations.push({ insertOne: { document: decoded } });
    }

    if (operations.length === 0) {
      return res.status(CreateAchievementsStatus.None).send({
        message: "No achievements to create (possible decode failures).",
        decodeFailures,
      });
    }

    try {
      // ordered: false, otherwise a single operation failing would abort the entire bulkWrite.
      const result = await Achievement.bulkWrite(operations, {
        ordered: false,
      });

      const inserted = result.insertedIds ? result.insertedIds : [];
      const createdIds = inserted
        .map((entry) => {
          if (!entry) return null;
          if (entry._id) return String(entry._id);
          if (entry.id) return String(entry.id);
          return null;
        })
        .filter(Boolean); // filter out null/falsy values
      const writeErrors =
        result.getWriteErrors().map((we) => ({
          index: we.index,
          code: we.code,
          errmsg: we.errmsg || we.err || String(we),
        })) || [];

      return res.status(CreateAchievementsStatus.Created).send({
        message: "Created achievements.",
        createdCount: result.insertedCount || createdIds.length,
        createdIds,
        writeErrorCount: result.getWriteErrorCount() || writeErrors.length,
        writeErrors,
        decodeFailures,
      });
    } catch (err) {
      logger.error("createAchievements failed", err);

      // in case of BulkWriteError, extract partial results
      if (err && err.result && err.result.insertedIds) {
        const inserted = err.result.insertedIds;
        const createdIds = inserted
          .map((e) => (e && e._id ? String(e._id) : null))
          .filter(Boolean);
        const writeErrors =
          err.result.getWriteErrors().map((we) => ({
            index: we.index,
            code: we.code,
            errmsg: we.errmsg || we.err || String(we),
          })) || [];

        return res.status(CreateAchievementsStatus.Created).send({
          message: "Created achievements (partial success).",
          createdCount: createdIds.length,
          createdIds,
          writeErrorCount: writeErrors.length,
          writeErrors,
          decodeFailures,
        });
      }

      return res
        .status(CreateAchievementsStatus.InternalError)
        .send({ message: "Failed to create achievements. (ERR301)" });
    }
  },
  getAchievements: async function (req, res) {
    let courseIds = [];
    if (req.body.courseIds) {
      try {
        courseIds = JSON.parse(req.body.courseIds);
        if (!Array.isArray(courseIds)) {
          return res.status(GetAchievementsStatus.MissingArguments).send({
            message:
              "Achievement retrieval failed: courseIds must be an array. (ERR200)",
          });
        }
      } catch (err) {
        return res
          .status(GetAchievementsStatus.MissingArguments)
          .send({ message: "Achievement retrieval failed. (ERR201)" });
      }
      // retain only valid course IDs
      courseIds = courseIds
        .map((id) => {
          if (!mongoose.isValidObjectId(id)) {
            return null;
          }
          return mongoose.Types.ObjectId(id);
        })
        .filter(Boolean);
    }
    let excludeGlobal = false;
    if (
      req.body.excludeGlobal === true ||
      String(req.body.excludeGlobal) === "true"
    ) {
      excludeGlobal = true;
    }
    let condition =
      !courseIds || courseIds.length === 0
        ? { course: null }
        : excludeGlobal
          ? { course: { $in: courseIds } }
          : {
              $or: [{ course: { $in: courseIds } }, { course: null }],
            };
    try {
      const achievements = await Achievement.find(condition).lean().exec();
      if (!achievements || achievements.length === 0) {
        return res
          .status(GetAchievementsStatus.NoAchievements)
          .send({ message: "No achievements available.", achievements: [] });
      }
      return res.status(GetAchievementsStatus.Retrieved).send({
        message: "Achievements retrieved.",
        achievements: achievements,
      });
    } catch (err) {
      logger.error(err);
      return res
        .status(GetAchievementsStatus.InternalError)
        .send({ message: "Achievement retrieval failed. (ERR204)" });
    }
  },
  getUserAchievements: async function (req, res) {
    // By default, the requester wants to fetch their own achievements
    let userId = req.token._id;
    // Teacher wants to look up a user's achievements
    if (req.body.userId && req.token.role === "TEACHER") {
      try {
        userId = new mongoose.Types.ObjectId(req.body.userId);
      } catch (err) {
        logger.error(
          `Failed to parse custom user id for getUserAchievements: ${err}`,
        );
        return res
          .status(GetUserAchievementsStatus.MissingArguments)
          .send({ message: "User achievement retrieval failed. (ERR200)" });
      }
    }
    let achievementIds = [];
    if (req.body.achievementIds) {
      try {
        achievementIds = JSON.parse(req.body.achievementIds);
        if (!Array.isArray(achievementIds)) {
          return res.status(GetUserAchievementsStatus.MissingArguments).send({
            message:
              "User achievement retrieval failed: achievementIds must be an array. (ERR201)",
          });
        }
      } catch (err) {
        return res
          .status(GetUserAchievementsStatus.MissingArguments)
          .send({ message: "User achievement retrieval failed. (ERR202)" });
      }
      // retain only valid achievement IDs
      achievementIds = achievementIds
        .map((id) => {
          if (!mongoose.isValidObjectId(id)) {
            return null;
          }
          return mongoose.Types.ObjectId(id);
        })
        .filter(Boolean);

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
      const userAchievements = await UserAchievement.find(condition)
        .lean()
        .exec();
      if (!userAchievements || userAchievements.length === 0) {
        return res.status(GetUserAchievementsStatus.NoUserAchievements).send({
          message: "No user achievements available.",
          achievements: [],
        });
      }
      return res.status(GetUserAchievementsStatus.Retrieved).send({
        message: "User achievements retrieved.",
        achievements: userAchievements,
      });
    } catch (err) {
      logger.error(err);
      return res
        .status(GetUserAchievementsStatus.InternalError)
        .send({ message: "User achievement retrieval failed. (ERR205)" });
    }
  },
  updateUserAchievements: async function (req, res) {
    let receivedUserAchievementsRaw = [];
    if (!req.body.userAchievements) {
      return res.status(UpdateUserAchievementsStatus.MissingArguments).send({
        message: "No user achievements indicated.",
      });
    }
    try {
      receivedUserAchievementsRaw = JSON.parse(req.body.userAchievements);
    } catch (err) {
      return res.status(UpdateUserAchievementsStatus.MissingArguments).send({
        message: "No user achievements indicated. (invalid json)",
      });
    }

    let receivedUserAchievements = [];
    for (let receivedUserAchievementRaw of receivedUserAchievementsRaw) {
      const userAchievement = ModelHelper.decodeUserAchievement(
        receivedUserAchievementRaw,
      );
      if (userAchievement) {
        userAchievement.user = req.token._id;

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
        message: "No user achievements indicated. (invalid achievements)",
      });
    }

    var operations = [];
    for (let receivedUserAchievement of receivedUserAchievements) {
      let userAchievementObject = receivedUserAchievement.toObject();
      delete userAchievementObject._id;
      operations.push({
        updateOne: {
          filter: {
            $and: [
              { achievement: receivedUserAchievement.achievement },
              { user: receivedUserAchievement.user },
              // TODO: include criteriaProgress comparison to not perform update if the existing criteriaProgress is the same
            ],
          },
          update: { $set: userAchievementObject }, // $set ensures only the given fields present in userAchievementObject are updated in the found document.
          upsert: true,
        },
      });
    }
    if (operations.length === 0) {
      return res
        .status(UpdateUserAchievementsStatus.None)
        .send({ message: "No user achievements to update." });
    }
    try {
      // "ordered: false" to avoid a single write failure aborting the entire bulkWrite operation
      const result = await UserAchievement.bulkWrite(operations, {
        ordered: false,
      });
      let insertedIds = result.upsertedIds || [];
      insertedIds = insertedIds
        .map((u) =>
          u && (u._id || u.id || u) ? String(u._id || u.id || u) : null,
        )
        .filter(Boolean);

      const modifiedIds = receivedUserAchievements
        .filter((elem) => elem._id)
        .map((elem) => String(elem._id))
        .filter((id) => !insertedIds.includes(id));

      const allIds = [...insertedIds, ...modifiedIds].map((id) =>
        mongoose.Types.ObjectId(id),
      );

      if (allIds.length === 0) {
        return res.status(UpdateUserAchievementsStatus.Updated).send({
          message: "User achievements updated (None).",
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          writeErrorCount: result.getWriteErrorCount(),
        });
      }
      try {
        const updatedUserAchievements = await UserAchievement.find({
          _id: { $in: allIds },
        })
          .lean()
          .exec();
        return res.status(UpdateUserAchievementsStatus.Updated).send({
          message: "User achievements updated.",
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          writeErrorCount: result.getWriteErrorCount(),
          userAchievements: updatedUserAchievements,
        });
      } catch (err) {
        logger.error(err);
        return res.status(UpdateUserAchievementsStatus.Updated).send({
          message: "User achievements updated, but failed to retrieve them.",
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          writeErrorCount: result.getWriteErrorCount(),
        });
      }
    } catch (err) {
      logger.error(err);
      return res
        .status(UpdateUserAchievementsStatus.InternalError)
        .send({ message: "Failed to update user achievements. (ERR941)" });
    }
  },
};

module.exports = functions;
