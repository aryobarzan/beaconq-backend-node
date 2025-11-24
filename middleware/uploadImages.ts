import util from "util";
import multer from "multer";
import process from "process";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import mongoose from "mongoose";
import { Request, Response } from "express";

const GridFSBucket = mongoose.mongo.GridFSBucket;

// const imageBucket = new mongo.GridFSBucket(mongoose.connection.db, {
//   bucketName: process.env.DATABASE_IMAGE_BUCKET,
// });

// const multerMemoryStorage = multer.memoryStorage(); // You can also use diskStorage or other options if needed
// const multerUpload = multer({ storage }).array("file", 10);

//

// Configuration
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/jpg"];
const MAX_FILE_SIZE = parseInt(
  process.env.UPLOAD_MAX_FILE_BYTES || `${5 * 1024 * 1024}`,
  10,
); // default: 5MB
const MAX_FILES = parseInt(process.env.UPLOAD_MAX_FILES || `10`, 10);
const DEFAULT_IMAGE_BUCKET = process.env.DATABASE_IMAGE_BUCKET || "images";

// Generate a random UUID while retaining the original file's extension
function getUniqueFileName(originalName: string) {
  const ext = path.extname(originalName) || "";
  return `${crypto.randomUUID()}${ext}`;
}

// Strip out HTML, e.g., from metadata such as "title" and "caption"
function stripHtml(input = "") {
  return String(input)
    .replace(/<[^>]*>/g, "")
    .slice(0, 1000);
}

// Detect if non-allowed image types have been provided based on their MIME
function imageFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only image uploads are allowed",
      ),
    );
  }
  cb(null, true);
}

// Use multer memory storage and stream into GridFS ourselves.
const multerStorage = multer.memoryStorage();
const uploadFiles = multer({
  storage: multerStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: imageFileFilter,
}).array("file", MAX_FILES);
const uploadFilesMiddleware = util.promisify(uploadFiles);

const GALLERY_BUCKET = process.env.GALLERY_BUCKET || "gallery_images";

const uploadGalleryImage = multer({
  storage: multerStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: imageFileFilter,
}).single("file");
const uploadGalleryImageMiddleware = util.promisify(uploadGalleryImage);

async function _storeBufferToGridFS(
  bucketName: string,
  file: Express.Multer.File,
  metadata = {},
) {
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName });
  const filename = getUniqueFileName(file.originalname);

  // Ensure uploadDate is present in metadata for easier querying/indexing
  const meta = Object.assign({}, metadata, { uploadDate: new Date() });

  const uploadStream = bucket.openUploadStream(filename, {
    metadata: meta,
    contentType: file.mimetype,
  });

  // we use Readable.from to convert our file buffer into a readable stream
  const readable = Readable.from([file.buffer]);
  // we use pipeline to connect our readable stream to the writable upload stream
  await pipeline(readable, uploadStream);

  return {
    id: uploadStream.id ? String(uploadStream.id) : null,
    filename,
    contentType: file.mimetype,
    length: file.size,
    uploadDate: meta.uploadDate,
  };
}

// promise-based handlers
async function uploadFilesHandler(req: Request, res: Response) {
  // No try-catch: the caller shall handle the HTTP response

  await uploadFilesMiddleware(req, res);
  // write each buffered file to GridFS and attach results to req.files
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) return;

  const results = [];
  for (const f of req.files) {
    const info = await _storeBufferToGridFS(DEFAULT_IMAGE_BUCKET, f, {});
    results.push(info);
  }
  // Replace req.files with an array of stored file info
  req.files = results;
  return;
}

async function uploadGalleryImageHandler(
  req: Request<{}, {}, {}, { title?: string; caption?: string }>,
  res: Response,
) {
  // No try-catch: the caller shall handle the HTTP response

  await uploadGalleryImageMiddleware(req, res);
  if (!req.file) return;

  const title = stripHtml(req.query && req.query.title);
  const caption = stripHtml(req.query && req.query.caption);

  const metadata: { author?: string; title?: string; caption?: string } = {};
  if (req && req.token && req.token._id) metadata.author = req.token._id;
  if (title) metadata.title = title.slice(0, 200);
  if (caption) metadata.caption = caption.slice(0, 1000);

  const info = await _storeBufferToGridFS(GALLERY_BUCKET, req.file, metadata);
  // TODO: verify if valid
  (req.file as any) = info;
  return;
}

export default {
  uploadFilesHandler,
  uploadGalleryImageHandler,
};
