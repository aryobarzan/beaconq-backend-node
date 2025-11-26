import { UserModel } from '../models/user';
import mongoose from 'mongoose';
import { Response } from 'express';
import logger from '../middleware/logger';
import permissionHelper from '../middleware/permissionHelper';
import { validatePassword } from './helperFunctions';

enum GetUsersStatus {
  Retrieved = 200,
  InternalError = 500,
}
enum ChangeUserPasswordStatus {
  Updated = 200,
  MissingArguments = 400,
  InvalidNewPassword = 452,
  InvalidUser = 453,
  InternalError = 500,
}

class ChangePasswordUserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'ChangePasswordUserNotFoundError';
    Object.setPrototypeOf(this, ChangePasswordUserNotFoundError.prototype);
  }
}

class ChangePasswordSaveFailedError extends Error {
  constructor() {
    super('Failed to save user');
    this.name = 'ChangePasswordSaveFailedError';
    Object.setPrototypeOf(this, ChangePasswordSaveFailedError.prototype);
  }
}

const functions = {
  authenticateAdmin: function (
    req: Express.AuthenticatedRequest<{ adminPassword: string }>,
    res: Response
  ) {
    if (
      !req.params.adminPassword ||
      !permissionHelper.isUserAdmin(req.token._id, req.params.adminPassword)
    ) {
      return res.status(403).send({
        message: 'Unauthorized action.',
      });
    }
    return res.status(200).send({
      message: 'Authorized.',
    });
  },
  getUsers: async function (
    req: Express.AuthenticatedRequest<{ adminPassword: string }>,
    res: Response
  ) {
    if (
      !req.params.adminPassword ||
      !permissionHelper.isUserAdmin(req.token._id, req.params.adminPassword)
    ) {
      return res.status(403).send({
        message: 'Unauthorized action.',
      });
    }
    try {
      // Limit number of users returned to avoid high memory usage
      const users = await UserModel.find(
        {},
        'username createdAt updatedAt role _id'
      )
        .limit(1000)
        .lean()
        .exec();
      if (!users) {
        return res.status(GetUsersStatus.InternalError).send({
          message: 'Users fetching failed: an error occurred. (ERR2)',
        });
      }
      return res.status(GetUsersStatus.Retrieved).send({
        message: 'Users retrieved.',
        users: users,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetUsersStatus.InternalError).send({
        message: 'Users fetching failed: an error occurred. (ERR1)',
      });
    }
  },
  changeUserPassword: async function (
    req: Express.AuthenticatedRequest<
      {},
      {},
      { adminPassword: string; userId: string; newPassword: string }
    >,
    res: Response
  ) {
    if (
      !req.body.adminPassword ||
      !permissionHelper.isUserAdmin(req.token._id, req.body.adminPassword)
    ) {
      return res.status(403).send({
        message: 'Unauthorized action.',
      });
    }
    if (!req.body.userId || !req.body.newPassword) {
      return res
        .status(ChangeUserPasswordStatus.MissingArguments)
        .send({ message: 'Password change failed: missing credentials.' });
    }

    if (!mongoose.isValidObjectId(req.body.userId)) {
      logger.error('Password change failed: invalid user. (ERR1)');
      return res.status(ChangeUserPasswordStatus.InvalidUser).send({
        message: 'Password change failed: invalid user. (ERR1)',
      });
    }
    const userId = new mongoose.Types.ObjectId(req.body.userId);

    const newPassword = String(req.body.newPassword);
    const isNewPasswordValid = validatePassword(newPassword);
    if (!isNewPasswordValid) {
      return res.status(ChangeUserPasswordStatus.InvalidNewPassword).send({
        message: 'New password does not conform to the requirements.',
      });
    }

    let session: mongoose.ClientSession;
    try {
      session = await mongoose.startSession();
    } catch (err: unknown) {
      logger.error(
        `Could not start mongo session for changeUserPassword: ${err}`
      );
      return res.status(ChangeUserPasswordStatus.InternalError).send({
        message: 'An error occurred while changing user password. (ERR4)',
      });
    }

    let responseToSend = {
      code: ChangeUserPasswordStatus.InternalError,
      payload: { message: 'An error occurred while changing user password.' },
    };

    try {
      await session.withTransaction(async () => {
        const user = await UserModel.findById(userId).session(session).exec();
        if (!user) {
          responseToSend = {
            code: ChangeUserPasswordStatus.InvalidUser,
            payload: {
              message: 'Failed to change password: user not found. (ERR2)',
            },
          };
          // we throw an error so withTransaction aborts
          throw new ChangePasswordUserNotFoundError();
        }

        user.password = newPassword;
        const saved = await user.save({ session });
        if (!saved) {
          responseToSend = {
            code: ChangeUserPasswordStatus.InternalError,
            payload: {
              message: 'An error occurred while changing user password. (ERR3)',
            },
          };
          throw new ChangePasswordSaveFailedError();
        }

        responseToSend = {
          code: ChangeUserPasswordStatus.Updated,
          payload: { message: 'Password changed.' },
        };
      });
    } catch (err: unknown) {
      // unexpected error
      if (
        !(err instanceof ChangePasswordUserNotFoundError) &&
        !(err instanceof ChangePasswordSaveFailedError)
      ) {
        logger.error(`changeUserPassword transaction failed: ${err}`);
        responseToSend = {
          code: ChangeUserPasswordStatus.InternalError,
          payload: {
            message: 'An error occurred while changing user password. (ERR4)',
          },
        };
      }
    } finally {
      session.endSession();
    }

    return res.status(responseToSend.code).send(responseToSend.payload);
  },
};

export default functions;
