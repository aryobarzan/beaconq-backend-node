import { QuizModel, QuizDocument } from '../../models/quiz';
import { PermissionModel, hasPermissions } from '../../models/permission';
import ModelHelper from '../../middleware/modelHelper';
import mongoose from 'mongoose';
import logger from '../../middleware/logger';
import { Response } from 'express';
import { UserRole, PermissionLevel } from '../../types/roles';

enum CreateOrUpdateQuizStatus {
  Created = 200,
  Updated = 209,
  MissingArguments = 400,
  InternalError = 500,
}

enum GetQuizzesStatus {
  Retrieved = 200,
  None = 209,
  InternalError = 500,
}

class CreateOrUpdateQuizPermissionError extends Error {
  constructor() {
    super('Lacking permission to update');
    this.name = 'CreateOrUpdateQuizPermissionError';
    Object.setPrototypeOf(this, CreateOrUpdateQuizPermissionError.prototype);
  }
}

const functions = {
  createOrUpdateQuiz: async function (
    req: Express.AuthenticatedRequest<{}, {}, { quiz: string }>,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: 'Quiz creation failed: only teachers are authorized.',
      });
    }
    if (!req.body.quiz) {
      return res
        .status(CreateOrUpdateQuizStatus.MissingArguments)
        .send({ message: 'Quiz creation failed: quiz parameter missing.' });
    }
    let newQuiz: QuizDocument;
    try {
      newQuiz = new QuizModel(JSON.parse(req.body.quiz));
    } catch (_: unknown) {
      return res.status(CreateOrUpdateQuizStatus.InternalError).send({
        message: 'Quiz creation failed: quiz could not be parsed/deserialized.',
      });
    }

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      return res.status(CreateOrUpdateQuizStatus.InternalError).send({
        message: `Quiz creation/update failed: internal error (session). (${err})`,
      });
    }

    let result: QuizDocument | undefined;
    let responseStatusCode: number = CreateOrUpdateQuizStatus.Updated;
    try {
      await session.withTransaction(async () => {
        const existingQuiz = await QuizModel.findById(newQuiz._id)
          .session(session)
          .exec();
        if (!existingQuiz) {
          responseStatusCode = CreateOrUpdateQuizStatus.Created;
          // New quiz
          const savedQuiz = await newQuiz.save({ session });
          // grant full permissions to the creator for this quiz
          await new PermissionModel({
            user: req.token._id,
            resourceType: 'QUIZ',
            resource: savedQuiz._id,
            level: PermissionLevel.EXECUTE,
          }).save({ session });
          const populatedQuiz = await ModelHelper.populateQuiz(savedQuiz);
          if (!populatedQuiz) {
            throw new Error('Failed to populate activities for created quiz');
          }
          // populateQuiz returns QuizDocument | QuizDocument[]
          // since a single quiz was passed, it returns a single quiz
          result = populatedQuiz as QuizDocument;
        } else {
          // Update existing quiz

          // Does the teacher have permission to update the existing activity
          const permission = await PermissionModel.findOne({
            user: req.token._id,
            resource: existingQuiz._id,
            resourceType: 'QUIZ',
          })
            .session(session)
            .lean()
            .exec();
          if (
            !permission ||
            !Number.isInteger(permission.level) ||
            !hasPermissions(['write'], permission.level)
          ) {
            throw new CreateOrUpdateQuizPermissionError();
          }

          newQuiz.version = existingQuiz.version + 1;
          /// Set {new: true} such that the updated model is returned by mongoose
          const updatedQuiz = await QuizModel.findByIdAndUpdate(
            existingQuiz._id,
            newQuiz,
            { new: true, session }
          );
          if (!updatedQuiz) {
            throw new Error('Failed to update quiz');
          }
          logger.info('Updated quiz: ' + updatedQuiz._id);
          const populatedQuiz = await ModelHelper.populateQuiz(updatedQuiz);
          if (!populatedQuiz) {
            throw new Error('Failed to populate activities for updated quiz');
          }
          // populateQuiz returns QuizDocument | QuizDocument[]
          // since a single quiz was passed, it returns a single quiz
          result = populatedQuiz as QuizDocument;
        }
      });
      // Creation or update of quiz was successful.
      if (result) {
        const message =
          responseStatusCode == CreateOrUpdateQuizStatus.Created
            ? 'Quiz created.'
            : 'Quiz updated.';
        return res.status(responseStatusCode).send({
          message: message,
          quiz: result.toJSON(),
        });
      } else {
        return res.status(CreateOrUpdateQuizStatus.InternalError).send({
          message: 'Quiz creation/update failed: internal error.',
        });
      }
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof CreateOrUpdateQuizPermissionError) {
        return res.status(403).send({ message: err.message });
      }
      return res.status(CreateOrUpdateQuizStatus.InternalError).send({
        message: `Quiz creation/update failed: internal error. (${err})`,
      });
    } finally {
      session.endSession();
    }
  },
  getQuizzes: async function (
    req: Express.AuthenticatedRequest,
    res: Response
  ) {
    if (req.token.role !== UserRole.TEACHER) {
      return res.status(403).send({
        message: 'Quiz fetching failed: only teachers are authorized.',
      });
    }
    try {
      const quizzes = await QuizModel.aggregate([
        {
          $lookup: {
            from: 'permissions',
            localField: '_id',
            foreignField: 'resource',
            as: 'permissions',
          },
        },
        {
          $match: {
            permissions: {
              // Important to use $elemMatch such that the same Permission document is used for these field checks
              $elemMatch: {
                resourceType: 'QUIZ',
                user: new mongoose.Types.ObjectId(req.token._id),
                level: { $gte: PermissionLevel.READ },
              },
            },
          },
        },
        { $unset: ['permissions'] },
      ]).exec();
      if (!quizzes || quizzes.length === 0) {
        return res
          .status(GetQuizzesStatus.None)
          .send({ message: 'Quiz fetching found no quizzes.' });
      }
      let populatedQuizzes = await ModelHelper.populateQuiz(quizzes);
      if (!populatedQuizzes) {
        res.status(GetQuizzesStatus.InternalError).send({
          message: 'Quiz fetching failed: failed to populate activities.',
        });
        return;
      }
      populatedQuizzes = populatedQuizzes as QuizDocument[];
      return res
        .status(GetQuizzesStatus.Retrieved)
        .send({ quizzes: populatedQuizzes.map((q) => q.toJSON()) });
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(GetQuizzesStatus.InternalError)
        .send({ message: 'Quiz fetching failed: an error occurred.' });
    }
  },
};

export default functions;
