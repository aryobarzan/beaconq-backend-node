import { TopicDocument, TopicModel } from "../../models/topic";
import { PermissionModel, hasPermissions } from "../../models/permission";
import mongoose from "mongoose";
import logger from "../../middleware/logger";
import { Response } from "express";
// Possible status codes
enum CreateOrUpdateTopicStatus {
  Created = 200,
  Updated = 209,
  MissingArguments = 400,
  InternalError = 500,
}
enum GetTopicsStatus {
  Retrieved = 200,
  None = 209,
  InternalError = 500,
}

class CreateOrUpdateTopicPermissionError extends Error {
  constructor() {
    super("Lacking permission to update");
    this.name = "CreateOrUpdateTopicPermissionError";
    Object.setPrototypeOf(this, CreateOrUpdateTopicPermissionError.prototype);
  }
}

const functions = {
  createOrUpdateTopic: async function (
    req: Express.AuthenticatedRequest<{}, {}, { topic: string }>,
    res: Response,
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: "Topic creation failed: only teachers are authorized.",
      });
    }
    if (!req.body.topic) {
      return res.status(CreateOrUpdateTopicStatus.MissingArguments).send({
        message: "Topic creation failed: missing topic parameter.",
      });
    }
    let newTopic: TopicDocument;
    try {
      newTopic = new TopicModel(JSON.parse(req.body.topic));
    } catch (err: unknown) {
      return res.status(CreateOrUpdateTopicStatus.InternalError).send({
        message:
          "Topic creation failed: topic could not be parsed/deserialized.",
      });
    }

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      return res.status(CreateOrUpdateTopicStatus.InternalError).send({
        message: `Topic creation/update failed: internal error (session). (${err})`,
      });
    }

    let result: TopicDocument | null = null;
    let responseStatusCode: number = CreateOrUpdateTopicStatus.Updated;

    try {
      await session.withTransaction(async () => {
        const existingTopic = await TopicModel.findById(newTopic._id)
          .session(session)
          .exec();
        // New topic
        if (!existingTopic) {
          responseStatusCode = CreateOrUpdateTopicStatus.Created;
          const savedTopic = await newTopic.save({ session });
          // grant creator full permissions for this topic (use savedTopic._id)
          await new PermissionModel({
            user: req.token._id,
            resourceType: "TOPIC",
            resource: savedTopic._id,
            level: PermissionLevel.EXECUTE,
          }).save({ session });
          result = savedTopic;
        } else {
          // Update existing topic

          // Does the teacher have permission to update the existing activity
          const permission = await PermissionModel.findOne({
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
            throw new CreateOrUpdateTopicPermissionError();
          }

          newTopic.version = existingTopic.version + 1;
          const updatedTopic = await TopicModel.findByIdAndUpdate(
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
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof CreateOrUpdateTopicPermissionError) {
        return res.status(403).send({ message: err.message });
      }
      return res.status(CreateOrUpdateTopicStatus.InternalError).send({
        message: `Topic creation/update failed: internal error. (${err})`,
      });
    } finally {
      session.endSession();
    }
  },
  getTopics: async function (req: Express.AuthenticatedRequest, res: Response) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: "Topic fetching failed: only teachers are authorized.",
      });
    }
    try {
      const topics = await TopicModel.aggregate([
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
                user: new mongoose.Types.ObjectId(req.token._id),
                level: { $gte: PermissionLevel.READ },
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
      return res.status(GetTopicsStatus.Retrieved).send({ topics });
    } catch (err) {
      logger.error(err);
      return res.status(GetTopicsStatus.InternalError).send({
        message: "Topic fetching failed: an error occurred.",
      });
    }
  },
  // DEPRECATED: for compatibility with older client versions, we just return a generic response that indicates success.
  rateTopic: function (_: Express.AuthenticatedRequest, res: Response) {
    return res.status(200).send({
      message: "Topic rating for course session stored.",
    });
  },
  // DEPRECATED: for compatibility with older client versions, we just return an empty array.
  getTopicRatings: function (_: Express.AuthenticatedRequest, res: Response) {
    return res.status(200).send({
      message: "Topic ratings retrieved.",
      topicRatings: [],
    });
  },
  // DEPRECATED: for compatibility with older client versions, we just respond that there are no topic ratings.
  getTopicsRatings: function (_: Express.AuthenticatedRequest, res: Response) {
    return res.status(209).send({ message: "No Topic ratings found." });
  },
};

export default functions;
