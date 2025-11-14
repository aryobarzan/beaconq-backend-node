const mongoose = require("mongoose");
const process = require("process");
const logger = require("../middleware/logger");

async function connectDB() {
  const maxAttempts = 10;
  let attempt = 0;
  while (true) {
    try {
      attempt++;
      const conn = await mongoose.connect(process.env.MONGO_URI, {});
      logger.info(`MongoDB Connected: ${conn.connection.host}`);

      // create indexes for GridFS-related collections (images, gallery_images)
      try {
        const db = conn.connection.db;
        const imageBucket = process.env.DATABASE_IMAGE_BUCKET || "images";
        const galleryBucket = process.env.GALLERY_BUCKET || "gallery_images";

        // ensure index on metadata.author and metadata.uploadDate for both buckets
        await db
          .collection(`${galleryBucket}.files`)
          .createIndex({ "metadata.author": 1, "metadata.uploadDate": -1 });
        await db
          .collection(`${imageBucket}.files`)
          .createIndex({ "metadata.uploadDate": -1 });
        logger.info(
          `Ensured GridFS metadata indexes for buckets: ${galleryBucket}, ${imageBucket}`,
        );
      } catch (indexErr) {
        // index creation is not fatal for startup -> we just log and continue.
        logger.warn(
          "Could not ensure GridFS indexes at startup:",
          indexErr.message || indexErr,
        );
      }

      break;
    } catch (err) {
      logger.error("Mongo connect attempt #", attempt, "failed:", err.message);
      if (attempt >= maxAttempts) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // exponential delay based on attempt number (max: 30s)
      const jitter = Math.floor(Math.random() * 1000); // random extra delay added on top of the base delay -> reduce possibility of contention due to synchronized retries
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
}

module.exports = connectDB;
