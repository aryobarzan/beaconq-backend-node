import process from "process";
import pino from "pino";
import rfs from "rotating-file-stream";
import fs from "fs";
import path from "path";
import os from "os";
// pino-http middleware to attach req/res info and measure latency
import { HttpLogger, pinoHttp } from "pino-http";

const isProd = process.env.NODE_ENV === "production";

// validate and sanitize log directory to prevent path traversal:
// without validation, attacker could use the LOG_DIR environment variable
// to write to arbitrary locations on the file system.
function getSafeLogDir(): string {
  const defaultLogDir = path.join(global.appRoot, "log");

  if (!process.env.LOG_DIR) {
    return defaultLogDir;
  }

  // resolve to absolute paths
  const requestedPath = path.resolve(process.env.LOG_DIR);
  const appRoot = path.resolve(global.appRoot);

  // check if requested path is within the app root
  const relativePath = path.relative(appRoot, requestedPath);

  // if relative path starts with '..' or is absolute, it is a path escape attempt! (dangerous)
  // NOTE: windows specific - if the path is on a different drive, it is absolute
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    console.warn(
      `Path traversal attempt detected in LOG_DIR: "${process.env.LOG_DIR}". ` +
      `Using default: "${defaultLogDir}"`
    );
    return defaultLogDir;
  }

  return requestedPath;
}

// validate and sanitize log filename to prevent path traversal. (similar to getSafeLogDir)
// without validation, attacker could use the LOG_FILENAME environment variable
// to write to arbitrary files on the file system.
function getSafeLogFilename(): string {
  const defaultFilename = "http_requests.log";

  if (!process.env.LOG_FILENAME) {
    return defaultFilename;
  }

  const requestedFilename = process.env.LOG_FILENAME;

  // check for path separators (unix and windows)
  if (requestedFilename.includes('/') || requestedFilename.includes('\\')) {
    console.warn(
      `Path separators detected in LOG_FILENAME: "${requestedFilename}". ` +
      `Using default: "${defaultFilename}"`
    );
    return defaultFilename;
  }

  // check for directory traversal
  if (requestedFilename.includes('..')) {
    console.warn(
      `Directory traversal detected in LOG_FILENAME: "${requestedFilename}". ` +
      `Using default: "${defaultFilename}"`
    );
    return defaultFilename;
  }

  // check for null byte injection.
  // example: "file.log\0.txt" might be truncated to "file.log" due to the null byte \0 
  // danger: bypass extension check
  if (requestedFilename.includes('\0')) {
    console.warn(
      `Null byte detected in LOG_FILENAME: "${requestedFilename}". ` +
      `Using default: "${defaultFilename}"`
    );
    return defaultFilename;
  }

  // ensure filename is not empty after trimming
  const trimmedFilename = requestedFilename.trim();
  if (trimmedFilename.length === 0) {
    console.warn(
      `Empty LOG_FILENAME. Using default: "${defaultFilename}"`
    );
    return defaultFilename;
  }

  // ensure filename ends with .log extension
  if (!trimmedFilename.toLowerCase().endsWith('.log')) {
    console.warn(
      `LOG_FILENAME must end with .log extension: "${trimmedFilename}". ` +
      `Using default: "${defaultFilename}"`
    );
    return defaultFilename;
  }

  return trimmedFilename;
}

const LOG_DIR = getSafeLogDir();
const LOG_FILENAME = getSafeLogFilename();
const LOG_LEVEL = process.env.LOG_LEVEL || (isProd ? "info" : "debug");
const ROTATE_SIZE = process.env.LOG_ROTATE_SIZE || "10M";
const ROTATE_INTERVAL = process.env.LOG_ROTATE_INTERVAL || "7d";
const ROTATE_COMPRESS =
  process.env.LOG_ROTATE_COMPRESS === "false" ? false : "gzip";
const ROTATE_MAX_FILES = process.env.LOG_ROTATE_MAX_FILES || 10;

// validation functions for rotating-file-stream configuration
type SizeUnit = 'K' | 'M' | 'G' | 'B';
type ValidSize = `${number}${SizeUnit}`;
type IntervalUnit = 's' | 'm' | 'h' | 'd';
type ValidInterval = `${number}${IntervalUnit}`;

function isValidSize(value: string): value is ValidSize {
  return /^\d+[KMGB]$/.test(value);
}

function isValidInterval(value: string): value is ValidInterval {
  return /^\d+[smhd]$/.test(value);
}

// ensure log directory exists
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.error("Failed to create log directory:", err);
  // if mkdir fails, fall back to console logging.
}

// Validate configuration
if (!isValidSize(ROTATE_SIZE)) {
  console.warn(
    `Invalid ROTATE_SIZE format: "${ROTATE_SIZE}". Expected format: <number><K|M|G|B>. Using default: 10M`
  );
}

if (!isValidInterval(ROTATE_INTERVAL)) {
  console.warn(
    `Invalid ROTATE_INTERVAL format: "${ROTATE_INTERVAL}". Expected format: <number><s|m|h|d>. Using default: 7d`
  );
}

const maxFiles = Number(ROTATE_MAX_FILES);
if (isNaN(maxFiles) || maxFiles <= 0) {
  console.warn(
    `Invalid ROTATE_MAX_FILES: "${ROTATE_MAX_FILES}". Must be a positive number. Using default: 10`
  );
}

// create rotating stream. If it fails, we fallback to stdout.
let stream: rfs.RotatingFileStream | null;
try {
  stream = rfs.createStream(LOG_FILENAME, {
    size: isValidSize(ROTATE_SIZE) ? ROTATE_SIZE : "10M",
    interval: isValidInterval(ROTATE_INTERVAL) ? ROTATE_INTERVAL : "7d",
    path: LOG_DIR,
    compress: ROTATE_COMPRESS,
    maxFiles: isNaN(maxFiles) || maxFiles <= 0 ? 10 : maxFiles,
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

function createHttpLogger(): HttpLogger {
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

      // ensure all logs are written
      if (typeof logger.flush === 'function') {
        logger.flush();
      }

      // setImmediate ensures logger.flush() has completed before
      // we proceed with closing the stream.
      setImmediate(() => {
        if (stream) {
          stream.end(() => {
            // don't use logger here anymore, we're closing it!
            console.info("Request logger flushed and rotating file stream closed");
            resolve();
          });
        } else {
          // don't use logger here
          console.info("Request logger flushed");
          resolve();
        }
      });
    } catch (err: unknown) {
      console.error("Error flushing request logger at shutdown", err);
      resolve();
    }
  });
}

export { logger, createHttpLogger, shutdownAndFlush };
