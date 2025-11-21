import pino from "pino";
import rfs from "rotating-file-stream";
import process from "process";
import path from "path";

// config
const LOG_FILE_NAME = "output.log";
const LOG_ROTATION_SIZE = "10M"; // rotate every 10MB written
const LOG_ROTATION_INTERVAL = "7d"; // rotate weekly

// if global.appRoot is set (by server.js), use it; otherwise use current directory
const appRoot = (global as any).appRoot || path.resolve(process.cwd());

const logDirectory = path.join(appRoot, "log");

// rotating file stream for log output
const fileStream = rfs.createStream(LOG_FILE_NAME, {
  size: LOG_ROTATION_SIZE,
  interval: LOG_ROTATION_INTERVAL,
  path: logDirectory,
  // compress: "gzip"
});

/**
 * Application logger using Pino.
 * - In development: logs to both file and console (with pretty formatting)
 * - In production: logs to rotating file only
 */
const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  process.env.NODE_ENV === "development"
    ? pino.multistream([
        { stream: fileStream },
        {
          stream: require("pino-pretty")({
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          }),
        },
      ])
    : fileStream,
);

export default logger;
