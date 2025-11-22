import process from "process";
import pino from "pino";
import rfs from "rotating-file-stream";
import fs from "fs";
import path from "path";
import os from "os";

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
let stream: rfs.RotatingFileStream | null;
try {
  stream = rfs.createStream(LOG_FILENAME, {
    size: ROTATE_SIZE as `${number}${'K' | 'M' | 'G' | 'B'}`,
    interval: ROTATE_INTERVAL as `${number}${'s' | 'm' | 'h' | 'd'}`,
    path: LOG_DIR,
    compress: ROTATE_COMPRESS,
    maxFiles: Number(ROTATE_MAX_FILES),
  });
  // listen for stream errors and fall back if needed
  stream.on("error", (err: Error) => {
    console.error(
      "request_logger rotating stream error, switching to stdout",
      err,
    );
  });
} catch (err: unknown) {
  console.error(
    "Failed to create rotating log stream, falling back to stdout",
    err,
  );
  stream = null;
}

// Configure pino options

const pinoOptions: pino.LoggerOptions = {
  level: LOG_LEVEL,
  redact: process.env.PINO_REDACT
    ? process.env.PINO_REDACT.split(",")
    : undefined,
  base: { pid: process.pid, hostname: os.hostname() }, // keep identifying base fields
};

// In development, pretty print (human-readable).
// In production, use JSON.
let logger: pino.Logger;
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
import { HttpLogger, pinoHttp } from "pino-http";

function expressLoggerFactory(): HttpLogger {
  return pinoHttp({
    logger,
    customLogLevel: function (res, err) {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  });
}

function shutdownAndFlush(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      logger.info("Request logger shutting down, flushing logs...");

      // ensure all logs still in the buffer are written
      logger.flush();

      // close the rotating file stream
      if (stream) {
        stream.end(() => {
          logger.info("Request logger flushed and rotating file stream closed");
          resolve();
        });
      } else {
        logger.info("Request logger flushed");
        resolve();
      }
    } catch (err: unknown) {
      console.error("Error flushing request logger at shutdown", err);
      resolve();
    }
  });
}

module.exports = {
  logger,
  express: expressLoggerFactory,
  shutdownAndFlush,
};
