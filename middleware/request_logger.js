const process = require("process");
const pino = require("pino");
const rfs = require("rotating-file-stream");
const fs = require("fs");
const path = require("path");
const os = require("os");

const isProd = process.env.NODE_ENV === "production";

const LOG_DIR = process.env.LOG_DIR || path.join(global.appRoot, "log");
const LOG_FILENAME = process.env.LOG_FILENAME || "http_requests.log";
const LOG_LEVEL = process.env.LOG_LEVEL || (isProd ? "info" : "debug");
const ROTATE_SIZE = process.env.LOG_ROTATE_SIZE || "10M";
const ROTATE_INTERVAL = process.env.LOG_ROTATE_INTERVAL || "7d";
const ROTATE_COMPRESS =
  process.env.LOG_ROTATE_COMPRESS === "false" ? false : "gzip";
const ROTATE_MAX_FILES = process.env.LOG_ROTATE_MAX_FILES || 10;

// ensure log directory exists
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  // if mkdir fails, fall back to console logging.
}

// create rotating stream. If it fails, we fallback to stdout.
let stream;
try {
  stream = rfs.createStream(LOG_FILENAME, {
    size: ROTATE_SIZE,
    interval: ROTATE_INTERVAL,
    path: LOG_DIR,
    compress: ROTATE_COMPRESS,
    maxFiles: ROTATE_MAX_FILES,
  });
  // listen for stream errors and fall back if needed
  stream.on("error", (err) => {
    console.error(
      "request_logger rotating stream error, switching to stdout",
      err,
    );
  });
} catch (err) {
  console.error(
    "Failed to create rotating log stream, falling back to stdout",
    err,
  );
  stream = null;
}

// Configure pino options

const pinoOptions = {
  level: LOG_LEVEL,
  redact: process.env.PINO_REDACT
    ? process.env.PINO_REDACT.split(",")
    : undefined,
  base: { pid: process.pid, hostname: os.hostname() }, // keep identifying base fields
};

// In development, pretty print (human-readable).
// In production, use JSON.
let logger;
if (!isProd) {
  // Fallback: create a logger that writes to stdout
  const pretty = pino.transport
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      })
    : undefined;

  if (pretty) {
    logger = pino(pinoOptions, pretty);
  } else {
    // Fallback
    logger = stream
      ? pino(pinoOptions, stream)
      : pino(pinoOptions, pino.destination({ sync: false }));
  }
} else {
  // Production: JSON logs to rotating file or stdout as fallback
  logger = stream
    ? pino(pinoOptions, stream)
    : pino(pinoOptions, pino.destination({ sync: false }));
}

// pino-http middleware to attach req/res info and measure latency
const pinoHttp = require("pino-http");

function expressLoggerFactory() {
  return pinoHttp({
    logger,
    customLogLevel: function (res, err) {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  });
}

function shutdownAndFlush() {
  return new Promise((resolve) => {
    try {
      const finalHandler = pino.final(logger, (err, finalLogger) => {
        if (err) finalLogger.error(err, "Error at shutdown");
        finalLogger.info("Logger flushed and shutting down");
      });

      finalHandler(null, () => {
        // final flush complete
        resolve();
      });
    } catch (err) {
      console.error("Error flushing logger at shutdown", err);
      resolve();
    }
  });
}

module.exports = {
  logger,
  express: expressLoggerFactory,
  shutdownAndFlush,
};
