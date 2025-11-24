import multer from "multer";

// Helper function to map MulterErrors to standard HTTP status codes alongside an explanatory message
export function mapMulterError(err: unknown) {
  if (!err || !(err instanceof multer.MulterError) || !err.code) return null;
  const code = err.code;

  if (code === "LIMIT_FILE_SIZE") {
    return {
      status: 413,
      body: { message: "One or more files are too large." },
    };
  }

  if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
    return {
      status: 400,
      body: { message: "Too many files to upload or unexpected file field." },
    };
  }

  if (
    code === "LIMIT_FIELD_KEY" ||
    code === "LIMIT_FIELD_VALUE" ||
    code === "LIMIT_FIELD_COUNT"
  ) {
    return { status: 400, body: { message: "Invalid form fields in upload." } };
  }

  // Default for any other multer error code
  return { status: 400, body: { message: err.message || "Upload error." } };
}
