var User = require("../models/user");
const jwt = require("jsonwebtoken");
var mongoose = require("mongoose");
const logger = require("../middleware/logger");
const permissionHelper = require("../middleware/permissionHelper");

const GetUsersStatus = Object.freeze({
  Retrieved: 200,
  InternalError: 500,
});
const ChangeUserPasswordStatus = Object.freeze({
  Updated: 200,
  MissingArguments: 400,
  InvalidNewPassword: 452,
  InvalidUser: 453,
  InternalError: 500,
});

var functions = {
  authenticateAdmin: function (req, res) {
    if (
      !req.params.adminPassword ||
      !permissionHelper.isUserAdmin(req.token._id, req.params.adminPassword)
    ) {
      return res.status(403).send({
        message: "Unauthorized action.",
      });
    }
    return res.status(200).send({
      message: "Authorized.",
    });
  },
  getUsers: async function (req, res) {
    if (
      !req.params.adminPassword ||
      !permissionHelper.isUserAdmin(req.token._id, req.params.adminPassword)
    ) {
      return res.status(403).send({
        message: "Unauthorized action.",
      });
    }
    try {
      // Limit number of users returned to avoid high memory usage
      let users = await User.find({}, "username createdAt updatedAt role _id")
        .limit(1000)
        .lean()
        .exec();
      if (!users) {
        return res.status(GetUsersStatus.InternalError).send({
          message: "Users fetching failed: an error occurred. (ERR2)",
        });
      }
      return res.status(GetUsersStatus.Retrieved).send({
        message: "Users retrieved.",
        // TODO: check if JSON.parse(JSON.stringify) is necessary now that lean() is applied (plain JS objects)
        users: JSON.parse(JSON.stringify(users)),
      });
    } catch (err) {
      logger.error(err);
      return res.status(GetUsersStatus.InternalError).send({
        message: "Users fetching failed: an error occurred. (ERR1)",
      });
    }
  },
  changeUserPassword: async function (req, res) {
    if (
      !req.body.adminPassword ||
      !permissionHelper.isUserAdmin(req.token._id, req.body.adminPassword)
    ) {
      return res.status(403).send({
        message: "Unauthorized action.",
      });
    }
    if (!req.body.userId || !req.body.newPassword) {
      return res
        .status(ChangeUserPasswordStatus.MissingArguments)
        .send({ message: "Password change failed: missing credentials." });
    }

    if (!mongoose.isValidObjectId(req.body.userId)) {
      logger.error("Password change failed: invalid user. (ERR1)");
      return res.status(ChangeUserPasswordStatus.InvalidUser).send({
        message: "Password change failed: invalid user. (ERR1)",
      });
    }
    const userId = new mongoose.Types.ObjectId(String(req.body.userId));

    const newPassword = String(req.body.newPassword);
    const allowedPatternRegex = /^[0-9A-Za-z_?!+\-]+$/;
    // Enforce allowed characters: digits, ASCII letters, underscore, ?, !, +, and hyphen (-)
    if (newPassword.length < 8 || !allowedPatternRegex.test(newPassword)) {
      return res.status(ChangeUserPasswordStatus.InvalidNewPassword).send({
        message: "New password does not conform to the requirements.",
      });
    }

    let session;
    try {
      session = await mongoose.startSession();
    } catch (err) {
      logger.error("Could not start mongo session for changeUserPassword", {
        err,
      });
      return res.status(ChangeUserPasswordStatus.InternalError).send({
        message: "An error occurred while changing user password. (ERR4)",
      });
    }

    let responseToSend = {
      code: ChangeUserPasswordStatus.InternalError,
      payload: { message: "An error occurred while changing user password." },
    };

    try {
      await session.withTransaction(async () => {
        const user = await User.findById(userId).session(session).exec();
        if (!user) {
          responseToSend = {
            code: ChangeUserPasswordStatus.InvalidUser,
            payload: {
              message: "Failed to change password: user not found. (ERR2)",
            },
          };
          // we throw an error so withTransaction aborts
          throw new Error("UserNotFound");
        }

        user.password = newPassword;
        const saved = await user.save({ session });
        if (!saved) {
          responseToSend = {
            code: ChangeUserPasswordStatus.InternalError,
            payload: {
              message: "An error occurred while changing user password. (ERR3)",
            },
          };
          throw new Error("SaveFailed");
        }

        responseToSend = {
          code: ChangeUserPasswordStatus.Updated,
          payload: { message: "Password changed." },
        };
      });
    } catch (err) {
      // unexpected error
      if (err.message !== "UserNotFound" && err.message !== "SaveFailed") {
        logger.error("changeUserPassword transaction failed", { err });
        responseToSend = {
          code: ChangeUserPasswordStatus.InternalError,
          payload: {
            message: "An error occurred while changing user password. (ERR4)",
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
