import moment from "moment";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import APIError from "../APIError.js";
import { catchAsync } from "../catchAsync.js";
const FILE_TYPE_CONFIGS = {
  images: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    "image/svg+xml": [".svg"],
    "image/bmp": [".bmp"],
    "image/tiff": [".tiff", ".tif"],
  },
  documents: {
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "text/plain": [".txt"],
    "text/csv": [".csv"],
  },
  audio: {
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/ogg": [".ogg"],
    "audio/aac": [".aac"],
  },
  video: {
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/x-msvideo": [".avi"],
    "video/webm": [".webm"],
  },
};

// Helper function to get allowed types from config
const getAllowedTypes = (fileTypes) => {
  const result = {};
  fileTypes.forEach((type) => {
    if (FILE_TYPE_CONFIGS[type]) {
      Object.assign(result, FILE_TYPE_CONFIGS[type]);
    }
  });
  return result;
};

// Helper function to validate file
const validateFile = (allowedTypes, mimeType, fileExt) => {
  if (!allowedTypes[mimeType]) {
    return { valid: false, error: `MIME type '${mimeType}' is not allowed` };
  }

  if (!allowedTypes[mimeType].includes(fileExt)) {
    return {
      valid: false,
      error: `Extension '${fileExt}' does not match MIME type '${mimeType}'. Expected: ${allowedTypes[
        mimeType
      ].join(", ")}`,
    };
  }

  return { valid: true };
};

const storage = (options) =>
  multer.diskStorage({
    destination: (req, _file, cb) => {
      const destPath = path.join("public", options.filePath(req, _file));
      const isExists = fs.existsSync(destPath);
      if (!isExists) {
        fs.mkdirSync(destPath, { recursive: true });
      }

      cb(null, destPath);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const date = moment().format("YYYYMMDDHHmmss");
      const filename = `${crypto
        .createHash("sha256")
        .update(Date.now().toString())
        .digest("hex")}${date}${ext}`;

      cb(null, filename);
    },
  });

export const upload = (options) =>
  multer({
    storage: storage(options),
    fileFilter: (_req, file, cb) => {
      const mimeType = file.mimetype;
      const fileExt = path.extname(file.originalname).toLowerCase();

      // If specific file types are defined, use them
      if (options.fileTypes) {
        const allowedTypes = getAllowedTypes(options.fileTypes);
        const validation = validateFile(allowedTypes, mimeType, fileExt);

        if (validation.valid) {
          cb(null, true);
        } else {
          cb(new APIError(validation.error, 400));
        }
      }
      // If custom allowedTypes object is provided (legacy support)
      else if (options.allowedTypes) {
        const validation = validateFile(options.allowedTypes, mimeType, fileExt);

        if (validation.valid) {
          cb(null, true);
        } else {
          cb(new APIError(validation.error, 400));
        }
      } else {
        cb(new APIError("Invalid file type", 400));
      }
    },
    limits: {
      fileSize: options.maxFileSize || 1024 * 1024 * 3, // Default 3MB, customizable
    },
  });
/**
 * Compress uploaded images to reduce file size
 * Supports JPEG, PNG, WebP formats
 * Progressively reduces quality until target size is met
 */
export const compressImage = catchAsync(async (req, res, next) => {
  console.log("compressImage");
  if (!req.file) {
    return next();
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const ext = path.extname(filePath).toLowerCase();

  // Only compress image files
  const compressibleImages = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
  };

  // Check if file type is compressible
  if (!compressibleImages[mimeType] || !compressibleImages[mimeType].includes(ext)) {
    return next();
  }

  try {
    let fileSize = fs.statSync(filePath).size;
    const targetSize = 1024 * 1024; // 1MB target
    let quality = 80; // Start with higher quality

    // Only compress if file is larger than target
    if (fileSize <= targetSize) {
      return next();
    }

    const tempPath = filePath.replace(ext, `-compressed${ext}`);

    // Compression loop with quality reduction
    while (fileSize > targetSize && quality >= 20) {
      // Delete previous temp file if exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      // Compress image based on format
      if (mimeType === "image/png") {
        await sharp(filePath).png({ quality, compressionLevel: 9 }).toFile(tempPath);
      } else if (mimeType === "image/webp") {
        await sharp(filePath).webp({ quality }).toFile(tempPath);
      } else {
        // JPEG/JPG
        await sharp(filePath).jpeg({ quality, mozjpeg: true }).toFile(tempPath);
      }

      fileSize = fs.statSync(tempPath).size;
      quality -= 10;
    }

    // Replace original with compressed version
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);

    // Update req.file with new size
    req.file.size = fs.statSync(filePath).size;
  } catch (error) {
    // If compression fails, continue with original file
    console.error("Image compression failed:", error);
    // Clean up temp file if exists
    const tempPath = filePath.replace(ext, `-compressed${ext}`);
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }

  next();
});
