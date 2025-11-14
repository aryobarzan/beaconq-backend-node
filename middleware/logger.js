/* eslint-disable no-undef */
const pino = require("pino");
const rfs = require("rotating-file-stream");
const process = require("process");
var path = require("path");
const stream = rfs.createStream("output.log", {
  size: "10M", // rotate every 10 MegaBytes written
  interval: "7d", // rotate weekly
  path: path.join(global.appRoot, "log"),
  //compress: "gzip" // compress rotated files
});
//const consoleStream = process.stdout
var pinoPretty;
if (process.env.NODE_ENV === "development") {
  pinoPretty = require("pino-pretty");
}

const logger = pino(
  {},
  process.env.NODE_ENV === "development"
    ? pino.multistream([{ stream: stream }, pinoPretty()])
    : stream
);
module.exports = logger;
