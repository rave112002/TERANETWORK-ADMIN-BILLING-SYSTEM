import fs from "fs/promises";
import multer from "multer";
import APIError from "../APIError.js";

// Enhanced unlink functions
export const unlinkSingle = async (file) => {
  try {
    if (!file) return false;

    const filePath = file.path || file;

    // Check if file exists before trying to delete
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      console.log(`Successfully deleted file: ${filePath}`);
      return true;
    } catch (accessErr) {
      // File doesn't exist, which is fine
      if (accessErr.code === "ENOENT") {
        console.log(`File doesn't exist (already deleted?): ${filePath}`);
        return true;
      }
      throw accessErr;
    }
  } catch (err) {
    console.error(`Error unlinking file: ${err.message}`);
    throw new APIError(`Error deleting file: ${err.message}`, 500);
  }
};

export const unlinkMultiple = async (files) => {
  try {
    if (!files?.length) return true;

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const filePath = file.path || file;
        try {
          await fs.access(filePath);
          await fs.unlink(filePath);
          return { success: true, file: filePath };
        } catch (err) {
          if (err.code === "ENOENT") {
            return {
              success: true,
              file: filePath,
              note: "File already deleted",
            };
          }
          throw err;
        }
      })
    );

    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      console.error("Some files failed to delete:", failures);
      // Don't throw error for cleanup failures, just log them
      return false;
    }

    console.log(`Successfully deleted ${files.length} files`);
    return true;
  } catch (err) {
    console.error(`Error unlinking multiple files: ${err.message}`);
    return false;
  }
};

// Smart file cleanup that handles all upload types
export const cleanupUploadedFiles = async (req) => {
  try {
    // Handle single file upload (.single())
    if (req.file) {
      await unlinkSingle(req.file);
      return;
    }

    // Handle multiple files (.array() or .fields())
    if (req.files) {
      // Check if it's an array (from .array())
      if (Array.isArray(req.files)) {
        await unlinkMultiple(req.files);
        return;
      }

      // Check if it's an object with field names (from .fields())
      if (typeof req.files === "object") {
        const allFiles = [];

        // Flatten all files from different fields
        Object.keys(req.files).forEach((fieldName) => {
          const fieldFiles = req.files[fieldName];
          if (Array.isArray(fieldFiles)) {
            allFiles.push(...fieldFiles);
          } else {
            allFiles.push(fieldFiles);
          }
        });

        if (allFiles.length > 0) {
          await unlinkMultiple(allFiles);
        }
        return;
      }
    }

    console.log("No files to cleanup");
  } catch (err) {
    console.error("Error during file cleanup:", err.message);
    // Don't throw error for cleanup failures during error handling
  }
};

export const globalUploadErrorHandler = (err, req, res, next) => {
  // Only handle multer errors and file-related APIErrors globally
  // Let other errors pass through to your main error handler
  if (
    !(err instanceof multer.MulterError) &&
    !(err instanceof APIError && err.message.includes("file"))
  ) {
    return next(err);
  }

  // Clean up any uploaded files on error
  cleanupUploadedFiles(req).catch((cleanupErr) => {
    console.error("Cleanup failed:", cleanupErr.message);
  });

  // Handle different types of multer errors
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          success: false,
          error: "File too large",
          message: `File size exceeds the maximum allowed size`,
          details: err.message,
        });

      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          error: "Too many files",
          message: "Number of files exceeds the maximum allowed",
          details: err.message,
        });

      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          error: "Unexpected field",
          message: "Unexpected file field in upload",
          details: err.message,
        });

      case "LIMIT_PART_COUNT":
        return res.status(400).json({
          success: false,
          error: "Too many parts",
          message: "Too many parts in multipart form",
          details: err.message,
        });

      case "LIMIT_FIELD_KEY":
        return res.status(400).json({
          success: false,
          error: "Field name too long",
          message: "Field name is too long",
          details: err.message,
        });

      case "LIMIT_FIELD_VALUE":
        return res.status(400).json({
          success: false,
          error: "Field value too long",
          message: "Field value is too long",
          details: err.message,
        });

      case "LIMIT_FIELD_COUNT":
        return res.status(400).json({
          success: false,
          error: "Too many fields",
          message: "Too many fields in form",
          details: err.message,
        });

      default:
        return res.status(400).json({
          success: false,
          error: "Upload error",
          message: "An error occurred during file upload",
          details: err.message,
        });
    }
  }

  // Handle custom APIError from file validation
  if (err instanceof APIError) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: "File validation error",
      message: err.message,
    });
  }

  // If we get here, pass to next error handler
  next(err);
};

// Keep the original handleUploadError for route-specific usage
export const handleUploadError = (err, req, res, next) => {
  // This is just a wrapper that calls the global handler
  globalUploadErrorHandler(err, req, res, next);
};
