import upload from '../middleware/uploadImages';
import process from 'process';
import mongoose from 'mongoose';
import logger from '../middleware/logger';
import { mapMulterError } from '../middleware/uploadErrorMapper';
import { Request, Response } from 'express';

const GridFSBucket = mongoose.mongo.GridFSBucket;

const uploadImages = async (req: Request, res: Response) => {
  try {
    await upload.uploadFilesHandler(req, res);
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .send({ message: 'You must select at least 1 file.' });
    }
    return res.status(200).send({
      message: 'Images have been uploaded.',
      images: req.files,
    });
  } catch (err: unknown) {
    logger.error(err);
    const mapped = mapMulterError(err);
    if (mapped) return res.status(mapped.status).send(mapped.body);
    return res.status(500).send({
      message: `Error while uploading image(s): ${err}`,
    });
  }
};
const downloadImage = async (
  req: Request<{}, {}, {}, { id: string }>,
  res: Response
) => {
  if (!req.query.id) {
    return res.status(400).send({ message: "Error: Specify the image's id." });
  }
  try {
    if (!mongoose.connection.db) {
      return res.status(500).send({
        message: 'Failed to download image details. (ERR491)',
      });
    }
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: process.env.DATABASE_IMAGE_BUCKET,
    });
    let downloadStream = bucket.openDownloadStream(
      new mongoose.Types.ObjectId(req.query.id)
    );
    downloadStream.on('data', function (data) {
      return res.status(200).write(data);
    });
    downloadStream.on('error', function (err) {
      logger.error(err);
      return res.status(404).send({ message: 'Cannot download the Image!' });
    });
    downloadStream.on('end', () => {
      return res.end();
    });
  } catch (err: unknown) {
    logger.error(err);
    return res.status(500).send({
      message: `Image download failed: ${err}`,
    });
  }
};

const deleteImages = async (
  req: Request<{}, {}, { images: string }>,
  res: Response
) => {
  if (!req.body.images) {
    return res.status(400).send({ message: "Error: Specify the images' ids." });
  }
  let deletedCount = 0;
  try {
    if (!mongoose.connection.db) {
      return res.status(500).send({
        message: 'Failed to delete images. (ERR491)',
      });
    }
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: process.env.DATABASE_IMAGE_BUCKET,
    });
    const imageIds = JSON.parse(req.body.images);
    if (Array.isArray(imageIds)) {
      for (const imageId of imageIds) {
        try {
          await bucket.delete(new mongoose.Types.ObjectId(String(imageId)));
          deletedCount += 1;
        } catch (err: unknown) {
          logger.error(err);
        }
      }
    }

    return res
      .status(200)
      .send({ message: 'Deleted images.', deletedCount: deletedCount });
  } catch (err: unknown) {
    logger.error(err);
    return res.status(500).send({
      message: `Failed to delete images: ${err}`,
    });
  }
};

// Gallery Images
const uploadGalleryImage = async (
  req: Request<{}, {}, {}, { title: string; caption: string }>,
  res: Response
) => {
  if (!req.query.title || !req.query.caption) {
    return res
      .status(400)
      .send({ message: 'You must indicate a title and a caption.' });
  }
  try {
    await upload.uploadGalleryImageHandler(req, res);
    if (!req.file) {
      return res.status(400).send({ message: 'You must select a file.' });
    }
    return res.status(200).send({
      message: 'Gallery image uploaded.',
      image: req.file,
    });
  } catch (err: unknown) {
    logger.error(err);
    const mapped = mapMulterError(err);
    if (mapped) {
      return res.status(mapped.status).send(mapped.body);
    }
    return res.status(500).send({
      message: `Error while uploading gallery image: ${err}`,
    });
  }
};

const downloadGalleryImage = async (
  req: Request<{ imageId: string }>,
  res: Response
) => {
  if (!req.params.imageId) {
    return res.status(400).send({ message: "Error: Specify the image's id." });
  }
  try {
    if (!mongoose.connection.db) {
      return res.status(500).send({
        message: 'Failed to download gallery image. (ERR491)',
      });
    }
    const bucket = new GridFSBucket(mongoose.connection.db, {
      // TODO: use process.env key instead
      bucketName: 'gallery_images',
    });
    const galleryImagesCollection = mongoose.connection.db.collection(
      'gallery_images' + '.files'
    );
    const document = await galleryImagesCollection.findOne({
      _id: new mongoose.Types.ObjectId(req.params.imageId),
    });
    if (!document) {
      return res.status(500).send({
        message: 'Failed to download gallery image. (ERR492)',
      });
    }
    res.set('title', document.metadata.title);
    res.set('caption', document.metadata.caption);
    res.set('id', req.params.imageId);
    let downloadStream = bucket.openDownloadStream(
      new mongoose.Types.ObjectId(req.params.imageId)
    );
    downloadStream.on('data', function (data) {
      return res.status(200).write(data);
    });
    downloadStream.on('error', function (err) {
      logger.error(err);
      return res.status(404).send({ message: 'Cannot download the Image!' });
    });
    downloadStream.on('end', () => {
      return res.end();
    });
  } catch (err: unknown) {
    logger.error(err);
    return res.status(500).send({
      message: `Failed to download image details: ${err}`,
    });
  }
};

const deleteGalleryImages = async (
  req: Request<{}, {}, { images: string }>,
  res: Response
) => {
  if (!req.body.images) {
    return res.status(400).send({ message: "Error: Specify the images' ids." });
  }
  let deletedCount = 0;
  try {
    if (!mongoose.connection.db) {
      return res.status(500).send({
        message: 'Failed to delete gallery images. (ERR491)',
      });
    }
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'gallery_images',
    });
    const imageIds = JSON.parse(req.body.images);
    if (Array.isArray(imageIds)) {
      for (const imageId of imageIds) {
        try {
          await bucket.delete(new mongoose.Types.ObjectId(String(imageId)));
          deletedCount += 1;
        } catch (err: unknown) {
          logger.error(err);
        }
      }
    }

    return res
      .status(200)
      .send({ message: 'Deleted images.', deletedCount: deletedCount });
  } catch (err: unknown) {
    logger.error(err);
    return res.status(500).send({
      message: `Failed to delete gallery images: ${err}`,
    });
  }
};

const getGalleryImageIdentifiers = async (
  req: Express.AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!mongoose.connection.db) {
      return res.status(500).send({
        message: 'Failed to get gallery image identifiers. (ERR491)',
      });
    }
    const authorId = req.token._id;
    const bucket = process.env.GALLERY_BUCKET || 'gallery_images';
    const collectionName = `${bucket}.files`;
    const galleryImagesCollection =
      mongoose.connection.db.collection(collectionName);

    const cursor = galleryImagesCollection
      .find(
        {
          'metadata.author': authorId,
        },
        {
          projection: {
            filename: 1,
            'metadata.title': 1,
            'metadata.caption': 1,
            uploadDate: 1,
          },
        }
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
      return res.status(209).send({
        message: 'No gallery images found.',
      });
    }
    return res.status(200).send(items);
  } catch (err: unknown) {
    logger.error(err);
    return res
      .status(500)
      .send({ message: `Failed to list gallery images: ${err}` });
  }
};

export default {
  uploadImages,
  downloadImage,
  deleteImages,
  uploadGalleryImage,
  downloadGalleryImage,
  deleteGalleryImages,
  getGalleryImageIdentifiers,
};
