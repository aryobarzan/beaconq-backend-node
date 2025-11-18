var Quiz = require("../../models/quiz");
const { Permission, hasPermissions } = require("../../models/permission");
var ModelHelper = require("../../middleware/modelHelper");
var mongoose = require("mongoose");
const logger = require("../../middleware/logger");

const CreateOrUpDateQuizStatus = Object.freeze({
  Created: 200,
  Updated: 209,
  MissingArguments: 400,
  InternalError: 500,
});

const GetQuizzesStatus = Object.freeze({
  Retrieved: 200,
  None: 209,
  InternalError: 500,
});

var functions = {
  createOrUpdateQuiz: async function (req, res) {
    if (!req.body.quiz) {
      return res
        .status(CreateOrUpDateQuizStatus.MissingArguments)
        .send({ message: "Quiz creation failed: quiz parameter missing." });
    }
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Quiz creation failed: only teachers are authorized.",
      });
    }
    var newQuiz = new Quiz(JSON.parse(req.body.quiz));
    if (!newQuiz) {
      return res.status(CreateOrUpDateQuizStatus.InternalError).send({
        message: "Quiz creation failed: quiz could not be deserialized.",
      });
    }

    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      return res.status(CreateOrUpDateQuizStatus.InternalError).send({
        message: `Quiz creation/update failed: internal error (session). (${err})`,
      });
    }

    let result = null;
    let responseStatusCode = CreateOrUpDateQuizStatus.Updated;
    try {
      await session.withTransaction(async () => {
        let existingQuiz = await Quiz.findById(newQuiz._id)
          .session(session)
          .exec();
        if (!existingQuiz) {
          responseStatusCode = CreateOrUpDateQuizStatus.Created;
          // New quiz
          const savedQuiz = await newQuiz.save({ session });
          // grant full permissions to the creator for this quiz
          await new Permission({
            user: req.token._id,
            resourceType: "QUIZ",
            resource: savedQuiz._id,
            level: 7,
          }).save({ session });
          const populatedQuiz = await ModelHelper.populateQuiz(savedQuiz);
          if (!populatedQuiz) {
            throw new Error("Failed to populate activities for created quiz");
          }
          result = populatedQuiz;
        } else {
          // Update existing quiz

          // Does the teacher have permission to update the existing activity
          const permission = await Permission.findOne({
            user: req.token._id,
            resource: existingQuiz._id,
            resourceType: "QUIZ",
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

          newQuiz.version = existingQuiz.version + 1;
          /// Set {new: true} such that the updated model is returned by mongoose
          const updatedQuiz = await Quiz.findByIdAndUpdate(
            existingQuiz._id,
            newQuiz,
            { new: true, session },
          );
          if (!updatedQuiz) {
            throw new Error("Failed to update quiz");
          }
          logger.info("Updated quiz: " + updatedQuiz._id);
          const populatedQuiz = await ModelHelper.populateQuiz(updatedQuiz);
          if (!populatedQuiz) {
            throw new Error("Failed to populate activities for updated quiz");
          }
          result = populatedQuiz;
        }
      });
      // Creation or update of quiz was successful.
      if (result) {
        const message =
          responseStatusCode == CreateOrUpDateQuizStatus.Created
            ? "Quiz created."
            : "Quiz updated.";
        return res.status(responseStatusCode).send({
          message: message,
          quiz: result.toJSON(),
        });
      }
    } catch (err) {
      logger.error(err);
      if (err && err.status && Number.isInteger(err.status)) {
        return res.status(err.status).send({ message: err.message });
      }
      return res.status(CreateOrUpDateQuizStatus.InternalError).send({
        message: `Quiz creation/update failed: internal error. (${err})`,
      });
    } finally {
      if (session) session.endSession();
    }
  },
  getQuizzes: async function (req, res) {
    if (req.token.role !== "TEACHER") {
      return res.status(403).send({
        message: "Quiz fetching failed: only teachers are authorized.",
      });
    }
    try {
      const quizzes = await Quiz.aggregate([
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
                resourceType: "QUIZ",
                user: new mongoose.Types.ObjectId(String(req.token._id)),
                level: { $gte: 4 },
              },
            },
          },
        },
        { $unset: ["permissions"] },
      ]).exec();
      if (!quizzes || quizzes.length === 0) {
        return res
          .status(GetQuizzesStatus.None)
          .send({ message: "Quiz fetching found no quizzes." });
      }
      const populatedQuizzes = await ModelHelper.populateQuiz(quizzes);
      if (!populatedQuizzes) {
        res.status(GetQuizzesStatus.InternalError).send({
          message: "Quiz fetching failed: failed to populate activities.",
        });
        return;
      }
      return res
        .status(GetQuizzesStatus.Retrieved)
        .send({ quizzes: JSON.parse(JSON.stringify(populatedQuizzes)) });
    } catch (err) {
      logger.error(err);
      return res
        .status(GetQuizzesStatus.InternalError)
        .send({ message: "Quiz fetching failed: an error occurred." });
    }
  },
};

module.exports = functions;
