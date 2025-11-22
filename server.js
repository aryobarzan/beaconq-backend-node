/*global __dirname, a*/

// server.js: server initialization, including database connection (MongoDB) and Firebase Admin
const path = require("path");
global.appRoot = path.resolve(__dirname);

const process = require("process");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const passport = require("passport");
const routes = require("./routes/routes");
const secureRoutes = require("./routes/secureRoutes");
const auth = require("./methods/auth");
const helmet = require("helmet");
const compression = require("compression");
const requestLogger = require("./middleware/requestLogger");
const logger = require("./middleware/logger");
const firebaseAdmin = require("firebase-admin");
const firebaseHelper = require("./middleware/firebaseHelper");

// set timezone
process.env.TZ = "Europe/Amsterdam";

// main set of required environment variables
function validateEnv() {
  const required = [
    "NODE_ENV",
    "PORT",
    "MONGO_URI",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`Missing required env vars: ${missing.join(", ")}`);
    return false;
  }
  return true;
}

let server;
let firebaseApp;
let isShuttingDown = false;

// Firebase Cloud Messaging (via firebase-admin sdk): Used for push notification scheduling (scheduled quizzes)
async function initFirebase() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    logger.warn(
      "No GOOGLE_APPLICATION_CREDENTIALS provided - firebase disabled",
    );
    return;
  }
  try {
    const serviceAccount = require(credPath);
    firebaseApp = firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
    logger.info("Firebase admin initialized");
  } catch (err) {
    logger.error("Failed to initialize Firebase admin:", err);
    throw err;
  }
}

function setGlobalHandlers() {
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception - exiting:", err);
    gracefulShutdown(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection - exiting:", reason);
    gracefulShutdown(1);
  });

  process.on("SIGINT", () => gracefulShutdown(0));
  process.on("SIGTERM", () => gracefulShutdown(0));
  // SIGUSR2 is commonly used by other processes to signal a restart, e.g., nodemon
  process.on("SIGUSR2", () => {
    gracefulShutdown(0, true);
  });
}

// close server, close DB and flush logs buffers.
// If `restart` is true, process.exit() is not called.
async function gracefulShutdown(exitCode = 0, restart = false) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Started graceful shutdown...");

  try {
    if (server) {
      logger.info("Closing server...");
      // stop accepting new connections
      server.close((err) => {
        if (err) logger.error("Error closing server:", err);
      });
      // wait a small duration in case of remaining connections
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // stop scheduling jobs / firebase helper
    try {
      if (firebaseHelper) {
        await firebaseHelper.shutdown();
        logger.info("Firebase shutdown completed.");
      }
    } catch (err) {
      logger.error("Error shutting down firebase:", err);
    }

    // close DB connection
    try {
      const mongoose = require("mongoose");
      await mongoose.connection.close(false);
      logger.info("DB connection closed.");
    } catch (err) {
      logger.error("Error closing DB:", err);
    }

    // flush request logger buffers
    try {
      await requestLogger.shutdownAndFlush();
    } catch (err) {
      console.error("Error flushing request logger during shutdown", err);
    }
  } catch (err) {
    logger.error("Error during graceful shutdown:", err);
  } finally {
    if (!restart) process.exit(exitCode);
  }
}

async function main() {
  if (!validateEnv()) {
    process.exit(1);
  }

  setGlobalHandlers();

  // initialize DB
  try {
    await connectDB();
    logger.info("DB connected.");
  } catch (err) {
    logger.error("Failed to connect to DB - exiting", err);
    process.exit(1);
  }

  // initialize firebase after database is initialized, as the notification scheduling by firebaseHelper queries the database.
  try {
    await initFirebase();
    firebaseHelper.setupNotifications();
  } catch (err) {
    logger.error(
      "Firebase initialization failed - continuing without firebase",
      err,
    );
  }

  const app = express();

  if (process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", true);
  }

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.urlencoded({ extended: false, limit: "50mb" }));
  app.use(express.json({ limit: "50mb" }));

  // pino-http middleware
  app.use(requestLogger.createHttpLogger());

  app.get("/health", (req, res) => res.status(200).send("OK"));

  // routes
  app.use(routes);
  app.use(passport.initialize());
  require("./config/passport")(passport);
  app.use("/secure", auth, secureRoutes);

  // custom 404 + JSON parse error handler + global fallback
  app.use((req, res, next) => {
    res.status(404).send("Unknown resource!");
  });

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      logger.error(`Invalid JSON body: ${err.message || err}`);
      return res.status(400).json({
        status: false,
        error: "The JSON in the request body could not be parsed.",
      });
    }
    logger.error(err);
    res.status(500).send("Sorry, something went wrong!");
  });

  app.get("/robots.txt", function (req, res) {
    res.type("text/plain");
    res.set("Cache-Control", "public, max-age=86400"); // 24 hour cache to avoid repetitive fetching by robot clients
    res.send("User-agent: *\nDisallow: /");
  });

  // start server
  const PORT = Number(process.env.PORT || 3000);
  server = app.listen(PORT, () => {
    logger.info(
      `BEACON Q server running in ${process.env.NODE_ENV} on port ${PORT}`,
    );
  });

  // server.keepAliveTimeout = 61000;
  // server.headersTimeout = 62000;
}

main().catch((err) => {
  logger.error("Fatal startup error:", err);
  process.exit(1);
});
