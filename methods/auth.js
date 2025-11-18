const jwt = require("jsonwebtoken");
var User = require("../models/user");
const process = require("process");
const logger = require("../middleware/logger");
var mongoose = require("mongoose");

module.exports = async (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      return res.status(401).send({ error: "Missing or invalid token." });
    }
    const token = authorizationHeader.split(" ")[1];
    const decodedToken = jwt.verify(token, process.env.PUBLIC_KEY);
    // Do not transmit hashed password to client
    delete decodedToken["password"];
    const userId = new mongoose.Types.ObjectId(String(decodedToken._id));
    const user = await User.findById(userId).select("username").lean();
    if (!user) {
      logger.warn(
        `Authentication failed for user id ${userId}. User could not be found in users collection.`,
      );
      return res.status(404).send({ error: "User account does not exist." });
    }
    req.token = decodedToken;
    req.username = user.username;
    next();
  } catch (err) {
    logger.error(err);
    return res.status(401).send({ error: "Invalid request!" });
  }
};
