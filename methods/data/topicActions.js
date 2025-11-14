var Topic = require("../../models/topic");
const { Permission, hasPermissions } = require("../../models/permission");
var mongoose = require("mongoose");
const logger = require("../../middleware/logger");

// Possible status codes
const CreateOrUpdateTopicStatus = Object.freeze({
  Created: 200,
  Updated: 209,
  MissingArguments: 400,
  InternalError: 500,
});
const GetTopicsStatus = Object.freeze({
  Retrieved: 200,
  None: 209,
  InternalError: 500,
});
const RateTopicStatus = Object.freeze({
  Rated: 200,
  Updated: 209,
  MissingArguments: 400,
  InvalidCourseSessionId: 452,
  InvalidTopicId: 453,
  InvalidRating: 454,
  InvalidCourseId: 455,
  SessionOver: 456,
  StudentsOnly: 457,
  InternalError: 500,
});
const GetTopicRatingsStatus = Object.freeze({
  Retrieved: 200,
  NoRatings: 209,
  MissingArguments: 400,
  InternalError: 500,
});

var functions = {
  createOrUpdateTopic: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Topic creation failed: only teachers are authorized.",
      });
    }
    if (!req.body.topic) {
      return res.status(CreateOrUpdateTopicStatus.MissingArguments).send({
        message: "Topic creation failed: missing topic parameter.",
      });
    }
    const newTopic = new Topic(JSON.parse(req.body.topic));
    if (!newTopic) {
      return res.status(CreateOrUpdateTopicStatus.InternalError).send({
        message: "Topic creation failed: topic could not be deserialized.",
      });
    }

    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      return res.status(CreateOrUpdateTopicStatus.InternalError).send({
        message: `Topic creation/update failed: internal error (session). (${err})`,
      });
    }

    let result = null;
    let responseStatusCode = CreateOrUpdateTopicStatus.Updated;

    try {
      await session.withTransaction(async () => {
        const existingTopic = await Topic.findById(newTopic._id)
          .session(session)
          .exec();
        // New topic
        if (!existingTopic) {
          responseStatusCode = CreateOrUpdateTopicStatus.Created;
          const savedTopic = await newTopic.save({ session });
          // grant creator full permissions for this topic (use savedTopic._id)
          await new Permission({
            user: req.token._id,
            resourceType: "TOPIC",
            resource: savedTopic._id,
            level: 7,
          }).save({ session });
          result = savedTopic;
        } else {
          // Update existing topic

          // Does the teacher have permission to update the existing activity
          const permission = await Permission.findOne({
            user: req.token._id,
            resource: existingTopic._id,
            resourceType: "TOPIC",
          })
            .session(session)
            .lean()
            .exec();
          if (
            !permission ||
            !Number.isInteger(permission.level) ||
            !hasPermissions(["write"], permission.level)
          ) {
            const err = new Error("Lacking permission to update");
            err.status = 403; // known status code for "forbidden"
            throw err;
          }

          newTopic.version = existingTopic.version + 1;
          const updatedTopic = await Topic.findByIdAndUpdate(
            existingTopic._id,
            newTopic,
            { new: true, session },
          ).exec();
          if (!updatedTopic) {
            throw new Error("Failed to update topic");
          }

          logger.info("Updated topic: " + updatedTopic._id);
          result = updatedTopic;
        }
      });
      if (result) {
        const message =
          responseStatusCode == CreateOrUpdateTopicStatus.Created
            ? "Topic created."
            : "Topic updated.";
        return res.status(responseStatusCode).send({
          message: message,
          topic: result.toJSON(),
        });
      }
    } catch (err) {
      logger.error(err);
      if (err && err.status && Number.isInteger(err.status)) {
        return res.status(err.status).send({ message: err.message });
      }
      return res.status(CreateOrUpdateTopicStatus.InternalError).send({
        message: `Topic creation/update failed: internal error. (${err})`,
      });
    } finally {
      if (session) session.endSession();
    }
  },
  getTopics: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Topic fetching failed: only teachers are authorized.",
      });
    }
    try {
      const topics = await Topic.aggregate([
        {
          $lookup: {
            from: "permissions",
            localField: "_id",
            foreignField: "resource",
            as: "permissions",
          },
        },
        {
          $match: {
            permissions: {
              // Important to use $elemMatch such that the same Permission document is used for these field checks
              $elemMatch: {
                resourceType: "TOPIC",
                user: mongoose.Types.ObjectId(req.token._id),
                level: { $gte: 4 },
              },
            },
          },
        },
        { $unset: ["permissions"] },
      ]).exec();
      if (!topics || topics.length === 0) {
        return res.status(GetTopicsStatus.None).send({
          message: "Topic fetching failed: none found.",
        });
      }
      return res
        .status(GetTopicsStatus.Retrieved)
        .send({ topics: JSON.parse(JSON.stringify(topics)) });
    } catch (err) {
      logger.error(err);
      return res.status(GetTopicsStatus.InternalError).send({
        message: "Topic fetching failed: an error occurred.",
      });
    }
  },
  // DEPRECATED: for compatibility with older client versions, we just return a generic response that indicates success.
  rateTopic: function (req, res) {
    return res.status(RateTopicStatus.Rated).send({
      message: "Topic rating for course session stored.",
    });
  },
  // DEPRECATED: for compatibility with older client versions, we just return an empty array.
  getTopicRatings: function (req, res) {
    return res.status(GetTopicRatingsStatus.Retrieved).send({
      message: "Topic ratings retrieved.",
      topicRatings: JSON.parse(JSON.stringify([])),
    });
  },
  // DEPRECATED: for compatibility with older client versions, we just respond that there are no topic ratings.
  getTopicsRatings: function (req, res) {
    return res
      .status(GetTopicRatingsStatus.NoRatings)
      .send({ message: "No Topic ratings found." });
  },
};

module.exports = functions;
