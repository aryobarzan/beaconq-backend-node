const upload = require("../middleware/uploadImages");
const process = require("process");
const mongoose = require("mongoose");
//const MongoClient = require("mongodb").MongoClient;
const GridFSBucket = require("mongodb").GridFSBucket;
const logger = require("../middleware/logger");
const { mapMulterError } = require("../middleware/uploadErrorMapper");

//const url = dbConfig.database;
//const baseUrl = dbConfig.url + "images/";
//const mongoClient = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
// const uploadImages2 = (req, res) => {
//   if (!req.files || req.files.length <= 0) {
//     return res
//       .status(400)
//       .send({ message: "You must select at least 1 file." });
//   }
//   const fileStream = req.files.buffer; // Get the file buffer from memory
//   const fileName = req.files.originalname;

//   const uploadStream = bucket.openUploadStream(fileName);
//   fileStream.pipe(uploadStream);

//   uploadStream.on("finish", () => {
//     res.status(200).send("File uploaded successfully!");
//   });

//   uploadStream.on("error", (err) => {
//     console.error("Error uploading file:", err);
//     res.status(500).send("Failed to upload file.");
//   });
// };
const uploadImages = async (req, res) => {
  try {
    await upload.uploadFilesHandler(req, res);
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .send({ message: "You must select at least 1 file." });
    }
    return res.status(200).send({
      message: "Images have been uploaded.",
      images: req.files,
    });
  } catch (err) {
    logger.error(err);
    const mapped = mapMulterError(err);
    if (mapped) return res.status(mapped.status).send(mapped.body);
    return res.status(500).send({
      message: `Error while uploading image(s): ${err?.message || "internal error"}`,
    });
  }
};
const downloadImage = async (req, res) => {
  if (!req.query.id) {
    return res.status(400).send({ message: "Error: Specify the image's id." });
  }
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: process.env.DATABASE_IMAGE_BUCKET,
    });
    let downloadStream = bucket.openDownloadStream(
      new mongoose.Types.ObjectId(String(req.query.id)),
    );
    downloadStream.on("data", function (data) {
      return res.status(200).write(data);
    });
    downloadStream.on("error", function (err) {
      logger.error(err);
      return res.status(404).send({ message: "Cannot download the Image!" });
    });
    downloadStream.on("end", () => {
      return res.end();
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).send({
      message: error.message,
    });
  }
};

const deleteImages = async (req, res) => {
  if (!req.body.images) {
    return res.status(400).send({ message: "Error: Specify the images' ids." });
  }
  var deletedCount = 0;
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: process.env.DATABASE_IMAGE_BUCKET,
    });
    var imageIds = JSON.parse(req.body.images);
    for (let i = 0; i < imageIds.length; i++) {
      try {
        await bucket.delete(new mongoose.Types.ObjectId(String(imageIds[i])));
        deletedCount += 1;
      } catch (error) {
        logger.error(error);
      }
    }
    return res
      .status(200)
      .send({ message: "Deleted images.", deletedCount: deletedCount });
  } catch (error) {
    logger.error(error);
    return res.status(500).send({
      message: error.message,
    });
  }
};
// const getImageIdentifiers = async (req, res) => {
//     try {
//         //await mongoClient.connect();
//         //const database = mongoClient.db(dbConfig.database);
//         const images = mongoose.connection.db.collection(dbConfig.imageBucket + ".files");
//         const cursor = images.find({});
//         if ((await cursor.countDocuments()) === 0) {
//             return res.status(500).send({
//                 message: "No files found!",
//             });
//         }
//         let fileInfos = [];
//         await cursor.forEach((doc) => {
//             fileInfos.push({
//                 name: doc.filename,
//                 url: baseUrl + doc.filename,
//             });
//         });
//         return res.status(200).send(fileInfos);
//     } catch (error) {
//         return res.status(500).send({
//             message: error.message,
//         });
//     }
// };

// Gallery Images
const uploadGalleryImage = async (req, res) => {
  if (!req.query.title || !req.query.caption) {
    return res
      .status(400)
      .send({ message: "You must indicate a title and a caption." });
  }
  try {
    await upload.uploadGalleryImageHandler(req, res);
    if (!req.file) {
      return res.status(400).send({ message: "You must select a file." });
    }
    return res.status(200).send({
      message: "Gallery image uploaded.",
      image: req.file,
    });
  } catch (err) {
    logger.error(err);
    const mapped = mapMulterError(err);
    if (mapped) {
      return res.status(mapped.status).send(mapped.body);
    }
    return res.status(500).send({
      message: `Error while uploading gallery image: ${err?.message || "internal error"}`,
    });
  }
};

const downloadGalleryImage = async (req, res) => {
  if (!req.params.imageId) {
    return res.status(400).send({ message: "Error: Specify the image's id." });
  }
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      // TODO: use process.env key instead
      bucketName: "gallery_images",
    });
    const galleryImagesCollection = mongoose.connection.db.collection(
      "gallery_images" + ".files",
    );
    const document = await galleryImagesCollection.findOne({
      _id: new mongoose.Types.ObjectId(String(req.params.imageId)),
    });
    if (!document) {
      return res.status(500).send({
        message: "Failed to download image details. (ERR492)",
      });
    }
    res.set("title", document.metadata.title);
    res.set("caption", document.metadata.caption);
    res.set("id", req.params.imageId);
    let downloadStream = bucket.openDownloadStream(
      new mongoose.Types.ObjectId(String(req.params.imageId)),
    );
    downloadStream.on("data", function (data) {
      return res.status(200).write(data);
    });
    downloadStream.on("error", function (err) {
      logger.error(err);
      return res.status(404).send({ message: "Cannot download the Image!" });
    });
    downloadStream.on("end", () => {
      return res.end();
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).send({
      message: error.message,
    });
  }
};

const deleteGalleryImages = async (req, res) => {
  if (!req.body.images) {
    return res.status(400).send({ message: "Error: Specify the images' ids." });
  }
  var deletedCount = 0;
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "gallery_images",
    });
    var imageIds = JSON.parse(req.body.images);
    for (let i = 0; i < imageIds.length; i++) {
      try {
        await bucket.delete(new mongoose.Types.ObjectId(String(imageIds[i])));
        deletedCount += 1;
      } catch (error) {
        logger.error(error);
      }
    }
    res
      .status(200)
      .send({ message: "Deleted images.", deletedCount: deletedCount });
  } catch (error) {
    logger.error(error);
    return res.status(500).send({
      message: error.message,
    });
  }
};

const getGalleryImageIdentifiers = async (req, res) => {
  try {
    const authorId = req.token._id;
    const bucket = process.env.GALLERY_BUCKET || "gallery_images";
    const collectionName = `${bucket}.files`;
    const galleryImagesCollection =
      mongoose.connection.db.collection(collectionName);

    const cursor = galleryImagesCollection
      .find(
        {
          "metadata.author": authorId,
        },
        {
          projection: {
            filename: 1,
            "metadata.title": 1,
            "metadata.caption": 1,
            uploadDate: 1,
          },
        },
      )
      .sort({ uploadDate: -1 }); // newest first

    const itemsRaw = await cursor.toArray();
    const items = itemsRaw.map((doc) => ({
      id: String(doc._id),
      name: doc.filename,
      title: doc.metadata?.title || null,
      caption: doc.metadata?.caption || null,
      uploadDate: doc.metadata?.uploadDate || null,
    }));

    if (items.length == 0) {
      res.status(209).send({
        message: "No gallery images found.",
      });
      return;
    }
    return res.status(200).send(items);
  } catch (error) {
    logger.error(error);
    return res.status(500).send({ message: "Failed to list gallery images." });
  }
};

module.exports = {
  uploadImages,
  downloadImage,
  deleteImages,
  uploadGalleryImage,
  downloadGalleryImage,
  deleteGalleryImages,
  getGalleryImageIdentifiers,
};
