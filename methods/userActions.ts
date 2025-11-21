import jwt from "jsonwebtoken";
import process from "process";
import bcrypt from "bcrypt";
import logger from "../middleware/logger";
import validateUserSecretQuestionAnswersSchema from "../middleware/jsonSchemaValidator";
import mongoose from "mongoose";
import { UserModel, UserDocument } from "../models/user";
import { Request, Response } from "express";

enum RegisterStatus {
  Registered = 200,
  MissingArguments = 400,
  UsernameExists = 452,
  InternalError = 500,
}

enum AuthenticateStatus {
  Authenticated = 200,
  MissingArguments = 400,
  WrongCredentials = 452,
  InternalError = 500,
}
enum DeleteAccountStatus {
  Deleted = 200,
  InvalidUserId = 452,
  InternalError = 500,
}
enum GetSecretQuestionStatus {
  Retrieved = 200,
  Empty = 201,
  MissingArguments = 400,
  InternalError = 500,
}
enum AddSecretQuestionStatus {
  Added = 200,
  Exists = 201,
  MissingArguments = 400,
  InvalidAnswer = 452,
  LimitReached = 453,
  InternalError = 500,
}
enum VerifySecretQuestionStatus {
  Correct = 200,
  MissingArguments = 400,
  InvalidQuestionAnswer = 452,
  InternalError = 500,
}
enum UpdatePasswordStatus {
  Updated = 200,
  MissingArguments = 400,
  InvalidPassword = 452,
  InvalidNewPassword = 453,
  InvalidUsername = 454,
  InvalidCredentials = 455,
  InternalError = 500,
}

function generateTokenForUser(user: UserDocument): string {
  return jwt.sign(user.toJSON(), process.env.PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: "5y",
  });
}

function validatePassword(password: string): {
  valid: boolean;
  error?: string;
} {
  // Enforce allowed characters: digits, ASCII letters, underscore, ?, !, +, and hyphen (-)
  const allowedPatternRegex = /^[0-9A-Za-z_?!+\-]+$/;
  if (password.length < 8 || !allowedPatternRegex.test(password)) {
    return {
      valid: false,
      error: "Your new password does not conform to the requirements.",
    };
  }
  return { valid: true };
}

async function authenticateUser(username: string, password: string) {
  const user = await UserModel.findOne({
    username: username,
  });
  if (!user) {
    return { err: null, token: null };
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return { err: null, token: null };
  }

  const token = generateTokenForUser(user);
  return {
    err: null,
    token: token,
    username: user.username,
    role: user.role,
  };
}
const functions = {
  register: async function (
    req: Request<{}, {}, { username: string; password: string }>,
    res: Response,
  ) {
    if (!req.body.username || !req.body.password) {
      return res
        .status(RegisterStatus.MissingArguments)
        .send({ message: "Registration failed: missing credentials" });
    }
    try {
      // Apply lean() for optimization, as we do not need the Mongoose overhead, e.g., methods, virtual properties, ...
      const user = await UserModel.findOne({
        username: req.body.username,
      }).lean();
      if (user) {
        logger.warn(
          `Registration failed: an account with the username ${req.body.username} already exists.`,
        );
        return res.status(RegisterStatus.UsernameExists).send({
          message:
            "Registration failed: an account with that username already exists.",
        });
      }

      const newUser = new UserModel({
        username: req.body.username,
        password: req.body.password,
      });
      const savedUser = await newUser.save();
      if (!savedUser) {
        return res.status(RegisterStatus.InternalError).send({
          message: "Registration failed: unable to store your credentials.",
        });
      }
      const token = generateTokenForUser(savedUser);
      return res.status(RegisterStatus.Registered).send({
        message: "Registration successful.",
        username: savedUser.username,
        role: savedUser.role,
        token: token,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(RegisterStatus.InternalError).send({
        message: "Registration failed: an error occurred.",
      });
    }
  },
  authenticate: async function (
    req: Request<{}, {}, { username: string; password: string }>,
    res: Response,
  ) {
    if (!req.body.username || !req.body.password) {
      return res.status(AuthenticateStatus.WrongCredentials).send({
        message: "Authentication failed: indicate your username and password.",
      });
    }
    try {
      const result = await authenticateUser(
        req.body.username,
        req.body.password,
      );
      if (!result || result.err || !result.token) {
        return res
          .status(AuthenticateStatus.WrongCredentials)
          .send({ message: "Authentication failed: wrong credentials." });
      }
      return res.status(AuthenticateStatus.Authenticated).send({
        token: result.token,
        username: result.username,
        role: result.role,
      });
    } catch (err: unknown) {
      logger.error(err);
      return res
        .status(AuthenticateStatus.InternalError)
        .send({ message: "Authentication failed: an error occurred." });
    }
  },
  isTokenValid: function (
    req: Request<{}, {}, {}, { token: string }>,
    res: Response,
  ) {
    // No need for any actual business logic here: this function is called as part of a secure route,
    // meaning the authentication middleware has already performed its verification logic.
    // As such, if this function is reached, then the user's token is valid.
    return res
      .status(200)
      .send({ message: "Token is valid.", token: req.token });
  },
  deleteAccount: async function (req: Request, res: Response) {
    try {
      const user = await UserModel.findById(req.token._id).exec();
      if (!user) {
        return res.status(DeleteAccountStatus.InvalidUserId).send({
          message:
            "Could not delete account for id " +
            req.token._id +
            ": user not found.",
        });
      }
      const deletedUser = await UserModel.findByIdAndDelete(
        req.token._id,
      ).exec();
      if (!deletedUser) {
        return res.status(DeleteAccountStatus.InternalError).send({
          message:
            "Could not delete account for id " +
            req.token._id +
            ": failed to delete user account.",
        });
      }
      return res
        .status(DeleteAccountStatus.Deleted)
        .send({ message: "Deleted account for id." });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(DeleteAccountStatus.InternalError).send({
        message:
          "Could not delete account for id " +
          req.token._id +
          ": an error occurred.",
      });
    }
  },
  /// Authentication not required
  getSecretQuestions: async function (
    req: Request<{ username: string }>,
    res: Response,
  ) {
    if (!req.params.username) {
      return res.status(GetSecretQuestionStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    try {
      const user = await UserModel.findOne({
        username: req.params.username,
      }).lean();
      if (!user) {
        return res.status(GetSecretQuestionStatus.MissingArguments).send({
          message: "Invalid request.",
        });
      }
      if (!user.secretQuestions || user.secretQuestions.length === 0) {
        return res.status(GetSecretQuestionStatus.Empty).send({
          message: "No secret question set up.",
        });
      }
      return res.status(GetSecretQuestionStatus.Retrieved).send({
        message: "Secret questions retrieved.",
        secretQuestions: JSON.parse(
          JSON.stringify(
            user.secretQuestions.map((element) => element.question),
          ),
        ),
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(GetSecretQuestionStatus.InternalError).send({
        message: "An error occurred retrieving secret question.",
      });
    }
  },
  addSecretQuestion: async function (
    req: Request<{}, {}, { question: string; answer: string }>,
    res: Response,
  ) {
    if (!req.body.question || !req.body.answer) {
      return res.status(AddSecretQuestionStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    const answer = req.body.answer;
    if (!answer || answer.length < 2) {
      return res.status(AddSecretQuestionStatus.InvalidAnswer).send({
        message:
          "The indicated secret answer needs to be at least 2 characters long.",
      });
    }
    if (answer.toLowerCase() === req.username.toLowerCase()) {
      return res.status(AddSecretQuestionStatus.InvalidAnswer).send({
        message: "The indicated secret answer may not be your username.",
      });
    }
    try {
      // important: hash answer in lowercase
      const hash = await bcrypt.hash(answer.toLowerCase(), 10);
      const updateResult = await UserModel.updateOne(
        {
          _id: req.token._id,
          "secretQuestions.question": { $ne: req.body.question },
        },
        {
          $addToSet: {
            secretQuestions: { question: req.body.question, answer: hash },
          },
        },
        { runValidators: true },
      );
      if (updateResult.acknowledged) {
        if (updateResult.modifiedCount > 0) {
          return res.status(AddSecretQuestionStatus.Added).send({
            message: "The secret question has been added.",
          });
        }
        return res.status(AddSecretQuestionStatus.Exists).send({
          message: "The secret question is already set.",
        });
      }
      return res.status(AddSecretQuestionStatus.InternalError).send({
        message: "An error occurred while storing the secret question. (ERR23)",
      });
    } catch (err: unknown) {
      logger.error(err);
      if (err instanceof Error && err.name === "ValidationError") {
        let errorMessage =
          "Failed to add secret question: your answer may be invalid or you've reached the maximum limit.";
        if (
          err instanceof mongoose.Error.ValidationError &&
          err.errors &&
          err.errors["secretQuestions"] &&
          err.errors["secretQuestions"].message
        ) {
          errorMessage = err.errors["secretQuestions"].message;
        }
        return res.status(AddSecretQuestionStatus.LimitReached).send({
          message: errorMessage,
        });
      }
      return res.status(AddSecretQuestionStatus.InternalError).send({
        message: "An error occurred while storing the secret question. (ERR98)",
      });
    }
  },
  verifySecretQuestion: async function (
    req: Request<{}, {}, { question: string; answer: string }>,
    res: Response,
  ) {
    if (!req.body.question || !req.body.answer) {
      return res.status(VerifySecretQuestionStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    try {
      const user = await UserModel.findById(req.token._id).exec();
      if (!user) {
        return res.status(VerifySecretQuestionStatus.InternalError).send({
          message:
            "An error occurred while verifying secret question/answer. (ERR4)",
        });
      }
      if (user.secretQuestions) {
        for (const secretQuestion of user.secretQuestions) {
          if (req.body.question === secretQuestion.question) {
            const secretAnswer = secretQuestion.answer;
            const isMatch = await bcrypt.compare(
              req.body.answer.toLowerCase(),
              secretAnswer,
            );
            if (isMatch) {
              return res.status(VerifySecretQuestionStatus.Correct).send({
                message: "Your answer to the secret question is correct.",
              });
            }
          }
        }
      }
      return res.status(VerifySecretQuestionStatus.InvalidQuestionAnswer).send({
        message: "Wrong secret question/answer.",
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(VerifySecretQuestionStatus.InternalError).send({
        message:
          "An error occurred while verifying secret question/answer. (ERR3)",
      });
    }
  },
  updatePasswordAuthenticated: async function (
    req: Request<{}, {}, { oldPassword: string; newPassword: string }>,
    res: Response,
  ) {
    if (!req.body.oldPassword || !req.body.newPassword) {
      return res.status(UpdatePasswordStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    const newPassword = req.body.newPassword;
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(UpdatePasswordStatus.InvalidNewPassword).send({
        message: validation.error,
      });
    }

    try {
      const user = await UserModel.findById(req.token._id).exec();
      if (!user) {
        return res.status(UpdatePasswordStatus.InvalidUsername).send({
          message: "Failed to update password: username not found. (ERR4)",
        });
      }
      const oldPasswordMatch = await bcrypt.compare(
        req.body.oldPassword,
        user.password,
      );
      if (!oldPasswordMatch) {
        return res.status(UpdatePasswordStatus.InvalidPassword).send({
          message: "Password update failed: wrong credentials.",
        });
      }
      user.password = newPassword;
      const updatedUser = await user.save();
      if (!updatedUser) {
        return res.status(UpdatePasswordStatus.InternalError).send({
          message: "An error occurred while updating your password. (ERR1)",
        });
      }
      return res.status(UpdatePasswordStatus.Updated).send({
        message: "Password updated.",
      });
    } catch (err: unknown) {
      logger.error(err);
      return res.status(UpdatePasswordStatus.InternalError).send({
        message: "An error occurred while updating your password. (ERR3)",
      });
    }
  },
  /// No authentication here: instead, the user has to provide answers to their account's secret questions
  updatePassword: async function (
    req: Request<
      {},
      {},
      {
        username: string;
        newPassword: string;
        secretQuestions: { question: string; answer: string }[];
      }
    >,
    res: Response,
  ) {
    if (
      !req.body.username ||
      !req.body.newPassword ||
      !req.body.secretQuestions ||
      !validateUserSecretQuestionAnswersSchema(req.body.secretQuestions)
    ) {
      return res.status(UpdatePasswordStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    const newPassword = req.body.newPassword;
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(UpdatePasswordStatus.InvalidNewPassword).send({
        message: validation.error,
      });
    }

    let responseToSend = {
      code: UpdatePasswordStatus.InternalError,
      payload: { message: "An error occurred while updating your password." },
    };

    try {
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const user = await UserModel.findOne({ username: req.body.username })
            .session(session)
            .exec();
          if (!user) {
            responseToSend = {
              code: UpdatePasswordStatus.InvalidUsername,
              payload: {
                message:
                  "Failed to update password: username not found. (ERR4)",
              },
            };
            throw new Error("UsernameNotFound");
          }
          if (!user.secretQuestions || user.secretQuestions.length === 0) {
            // If the user's account has no secret questions set up, do not allow password updates
            responseToSend = {
              code: UpdatePasswordStatus.InvalidCredentials,
              payload: {
                message: "Password update failed: wrong credentials.",
              },
            };
            throw new Error("WrongCredentialsNoSecrets");
          }

          let secretQuestionAnswerMatches = 0;
          for (const secretQuestion of user.secretQuestions) {
            for (const userSecretQuestionAnswer of req.body.secretQuestions) {
              if (
                userSecretQuestionAnswer["question"] === secretQuestion.question
              ) {
                const isMatch = await bcrypt.compare(
                  userSecretQuestionAnswer["answer"].toLowerCase(),
                  secretQuestion.answer,
                );
                if (isMatch) {
                  secretQuestionAnswerMatches += 1;
                }
                break;
              }
            }
          }
          if (secretQuestionAnswerMatches !== user.secretQuestions.length) {
            responseToSend = {
              code: UpdatePasswordStatus.InvalidCredentials,
              payload: {
                message: "Password update failed: wrong credentials.",
              },
            };
            throw new Error("WrongCredentials");
          }
          // TODO: do not allow same old password
          user.password = newPassword;
          const updatedUser = await user.save({ session });
          if (!updatedUser) {
            responseToSend = {
              code: UpdatePasswordStatus.InternalError,
              payload: {
                message:
                  "An error occurred while updating your password. (ERR1)",
              },
            };
            throw new Error("UserUpdateFailed");
          }
          responseToSend = {
            code: UpdatePasswordStatus.Updated,
            payload: { message: "Password updated." },
          };
        });
      } catch (err: unknown) {
        const knownErrors = new Set([
          "UsernameNotFound",
          "WrongCredentialsNoSecrets",
          "WrongCredentials",
          "UserUpdateFailed",
        ]);
        // Unexpected error
        if (!(err instanceof Error) || !knownErrors.has(err.message)) {
          logger.error(err);
          responseToSend = {
            code: UpdatePasswordStatus.InternalError,
            payload: {
              message: "An error occurred while updating your password. (ERR3)",
            },
          };
        }
      } finally {
        await session.endSession();
      }
    } catch (err: unknown) {
      logger.error(err);
      return res.status(UpdatePasswordStatus.InternalError).send({
        message: "An error occurred while updating your password. (ERR5)",
      });
    }

    return res.status(responseToSend.code).send(responseToSend.payload);
  },
};

export default functions;
