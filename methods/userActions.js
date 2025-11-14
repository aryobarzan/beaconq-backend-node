var User = require("../models/user");
const jwt = require("jsonwebtoken");
const process = require("process");
var bcrypt = require("bcrypt");
const logger = require("../middleware/logger");
const jsonSchemaValidator = require("../middleware/jsonSchemaValidator");
var mongoose = require("mongoose");

const RegisterStatus = Object.freeze({
  Registered: 200,
  MissingArguments: 400,
  UsernameExists: 452,
  InternalError: 500,
});
const AuthenticateStatus = Object.freeze({
  Authenticated: 200,
  MissingArguments: 400,
  WrongCredentials: 452,
  InternalError: 500,
});
const DeleteAccountStatus = Object.freeze({
  Deleted: 200,
  InvalidUserId: 452,
  InternalError: 500,
});
const GetSecretQuestionStatus = Object.freeze({
  Retrieved: 200,
  Empty: 201,
  MissingArguments: 400,
  InternalError: 500,
});
const AddSecretQuestionStatus = Object.freeze({
  Added: 200,
  Exists: 201,
  MissingArguments: 400,
  InvalidAnswer: 452,
  LimitReached: 453,
  InternalError: 500,
});
const VerifySecretQuestionStatus = Object.freeze({
  Correct: 200,
  MissingArguments: 400,
  InvalidQuestionAnswer: 452,
  InternalError: 500,
});
const UpdatePasswordStatus = Object.freeze({
  Updated: 200,
  MissingArguments: 400,
  InvalidPassword: 452,
  InvalidNewPassword: 453,
  InvalidUsername: 454,
  InvalidCredentials: 455,
  InternalError: 500,
});
function generateTokenForUser(user) {
  return jwt.sign(user.toJSON(), process.env.PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: "5y",
  });
}
async function authenticateUser(username, password) {
  const user = await User.findOne({
    username: username,
  });
  if (!user) {
    return { err: null, token: null };
  }
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return { err: null, token: null };
  }
  var token = generateTokenForUser(user);
  return {
    err: null,
    token: token,
    username: user.username,
    role: user.role,
  };
}
var functions = {
  register: async function (req, res) {
    if (!req.body.username || !req.body.password) {
      return res
        .status(RegisterStatus.MissingArguments)
        .send({ message: "Registration failed: missing credentials" });
    }
    try {
      // Apply lean() for optimization, as we do not need the Mongoose overhead, e.g., methods, virtual properties, ...
      const user = await User.findOne({ username: req.body.username }).lean();
      if (user) {
        logger.warn(
          `Registration failed: an account with the username ${req.body.username} already exists.`,
        );
        return res.status(RegisterStatus.UsernameExists).send({
          message:
            "Registration failed: an account with that username already exists.",
        });
      }

      const newUser = new User({
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
    } catch (err) {
      logger.error(err);
      return res.status(RegisterStatus.InternalError).send({
        message: "Registration failed: an error occurred.",
      });
    }
  },
  authenticate: async function (req, res) {
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
    } catch (err) {
      logger.error(err);
      return res
        .status(AuthenticateStatus.InternalError)
        .send({ message: "Authentication failed: an error occurred." });
    }
  },
  isTokenValid: function (req, res) {
    // No need for any actual business logic here: this function is called as part of a secure route,
    // meaning the authentication middleware has already performed its verification logic.
    // As such, if this function is reached, then the user's token is valid.
    res.status(200).send({ message: "Token is valid.", token: req.token });
  },
  deleteAccount: async function (req, res) {
    try {
      const user = await User.findById(req.token._id).exec();
      if (!user) {
        return res.status(DeleteAccountStatus.InvalidUserId).send({
          message:
            "Could not delete account for id " +
            req.token._id +
            ": user not found.",
        });
      }
      const deletedUser = await User.findByIdAndDelete(req.token._id).exec();
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
    } catch (err) {
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
  getSecretQuestions: async function (req, res) {
    if (!req.params.username) {
      return res.status(GetSecretQuestionStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    try {
      const user = await User.findOne({ username: req.params.username }).lean();
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
    } catch (err) {
      logger.error(err);
      return res.status(GetSecretQuestionStatus.InternalError).send({
        message: "An error occurred retrieving secret question.",
      });
    }
  },
  addSecretQuestion: async function (req, res) {
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
      const updateResult = await User.updateOne(
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
    } catch (err) {
      logger.error(err);
      if (err.name === "ValidationError") {
        let errorMessage =
          "Failed to add secret question: your answer may be invalid or you've reached the maximum limit.";
        if (
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
  verifySecretQuestion: async function (req, res) {
    if (!req.body.question || !req.body.answer) {
      return res.status(VerifySecretQuestionStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    try {
      const user = await User.findById(req.token._id).exec();
      if (!user) {
        return res.status(VerifySecretQuestionStatus.InternalError).send({
          message:
            "An error occurred while verifying secret question/answer. (ERR4)",
        });
      }
      if (user.secretQuestions) {
        for (let i = 0; i < user.secretQuestions.length; i++) {
          if (req.body.question === user.secretQuestions[i].question) {
            let secretAnswer = user.secretQuestions[i].answer;
            let isMatch = await bcrypt.compare(
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
    } catch (err) {
      logger.error(err);
      return res.status(VerifySecretQuestionStatus.InternalError).send({
        message:
          "An error occurred while verifying secret question/answer. (ERR3)",
      });
    }
  },
  updatePasswordAuthenticated: async function (req, res) {
    if (!req.body.oldPassword || !req.body.newPassword) {
      return res.status(UpdatePasswordStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    const newPassword = String(req.body.newPassword);
    const allowedPatternRegex = /^[0-9A-Za-z_?!+\-]+$/;
    // Enforce allowed characters: digits, ASCII letters, underscore, ?, !, +, and hyphen (-)
    if (newPassword.length < 8 || !allowedPatternRegex.test(newPassword)) {
      return res.status(UpdatePasswordStatus.InvalidNewPassword).send({
        message: "Your new password does not conform to the requirements.",
      });
    }

    try {
      const user = await User.findById(req.token._id).exec();
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
    } catch (err) {
      logger.error(err);
      return res.status(UpdatePasswordStatus.InternalError).send({
        message: "An error occurred while updating your password. (ERR3)",
      });
    }
  },
  /// No authentication here: instead, the user has to provide answers to their account's secret questions
  updatePassword: async function (req, res) {
    if (
      !req.body.username ||
      !req.body.newPassword ||
      !req.body.secretQuestions ||
      !jsonSchemaValidator.validateUserSecretQuestionAnswersSchema(
        req.body.secretQuestions,
      )
    ) {
      return res.status(UpdatePasswordStatus.MissingArguments).send({
        message: "Invalid request.",
      });
    }
    const newPassword = String(req.body.newPassword);
    const allowedPatternRegex = /^[0-9A-Za-z_?!+\-]+$/;
    // Enforce allowed characters: digits, ASCII letters, underscore, ?, !, +, and hyphen (-)
    if (newPassword.length < 8 || !allowedPatternRegex.test(newPassword)) {
      return res.status(UpdatePasswordStatus.InvalidNewPassword).send({
        message: "Your new password does not conform to the requirements.",
      });
    }

    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      logger.error(err);
      return res.status(UpdatePasswordStatus.InternalError).send({
        message: "An error occurred while updating your password. (ERR5)",
      });
    }

    let responseToSend = {
      code: UpdatePasswordStatus.InternalError,
      payload: { message: "An error occurred while updating your password." },
    };
    try {
      await session.withTransaction(async () => {
        const user = await User.findOne({ username: req.body.username })
          .session(session)
          .exec();
        if (!user) {
          responseToSend = {
            code: UpdatePasswordStatus.InvalidUsername,
            payload: {
              message: "Failed to update password: username not found. (ERR4)",
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
        for (let i = 0; i < user.secretQuestions.length; i++) {
          let secretQuestion = user.secretQuestions[i];
          for (let j = 0; j < req.body.secretQuestions.length; j++) {
            let userSecretQuestionAnswer = req.body.secretQuestions[j];
            if (
              userSecretQuestionAnswer["question"] === secretQuestion.question
            ) {
              let isMatch = await bcrypt.compare(
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
        if (secretQuestionAnswerMatches != user.secretQuestions.length) {
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
              message: "An error occurred while updating your password. (ERR1)",
            },
          };
          throw new Error("UserUpdateFailed");
        }
        responseToSend = {
          code: UpdatePasswordStatus.Updated,
          payload: { message: "Password updated." },
        };
      });
    } catch (err) {
      const knownErrors = new Set([
        "UsernameNotFound",
        "WrongCredentialsNoSecrets",
        "WrongCredentials",
        "UserUpdateFailed",
      ]);
      // Unexpected error
      if (!err || !err.message || !knownErrors.has(err.message)) {
        logger.error(err);
        responseToSend = {
          code: UpdatePasswordStatus.InternalError,
          payload: {
            message: "An error occurred while updating your password. (ERR3)",
          },
        };
      }
    } finally {
      if (session) session.endSession();
    }
    return res.status(responseToSend.code).send(responseToSend.payload);
  },
};

module.exports = functions;
