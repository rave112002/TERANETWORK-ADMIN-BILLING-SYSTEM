import fs from "fs";
import path from "path";
import sharp from "sharp";
import catchAsync from "../catchAsync.js";
// Configuration object for different compression scenarios
const COMPRESSION_CONFIGS = {
  profile: {
    maxDimension: 500, // Single dimension for square crops
    width: null,
    height: null,
    crop: true, // For profile pics, we might want square crops
    quality: 80,
    targetSize: 200 * 1024, // 200KB
    format: "jpeg",
  },
  thumbnail: {
    maxDimension: 150,
    width: null,
    height: null,
    crop: true,
    quality: 70,
    targetSize: 50 * 1024, // 50KB
    format: "jpeg",
  },
  general: {
    maxDimension: 1920, // Largest dimension shouldn't exceed this
    width: null,
    height: null,
    crop: false, // Preserve aspect ratio
    quality: 85,
    targetSize: 1024 * 1024, // 1MB
    format: "jpeg",
  },
  document: {
    maxDimension: 2048,
    width: null,
    height: null,
    crop: false,
    quality: 90,
    targetSize: 2 * 1024 * 1024, // 2MB
    format: "jpeg",
  },
};

export const compressImage = (config = "general") => {
  return catchAsync(async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const ext = path.extname(filePath).toLowerCase();

    // Skip compression if not an image
    if (!mimeType.startsWith("image/")) {
      return next();
    }

    try {
      const compressionConfig = COMPRESSION_CONFIGS[config] || COMPRESSION_CONFIGS.general;
      const tempPath = filePath.replace(ext, `-temp${ext}`);

      // Get original file stats
      const originalStats = fs.statSync(filePath);
      const originalSize = originalStats.size;

      // If file is already smaller than target, skip compression
      if (originalSize <= compressionConfig.targetSize) {
        return next();
      }

      // Get image metadata
      const metadata = await sharp(filePath).metadata();

      let sharpInstance = sharp(filePath);

      // Handle resizing based on configuration
      const needsResize =
        compressionConfig.maxDimension &&
        (metadata.width > compressionConfig.maxDimension ||
          metadata.height > compressionConfig.maxDimension);

      if (needsResize) {
        if (compressionConfig.crop) {
          // For profile pics/thumbnails - create square crop
          const size = compressionConfig.maxDimension;
          sharpInstance = sharpInstance.resize(size, size, {
            fit: "cover", // This crops to fill the dimensions
            position: "center",
          });
        } else {
          // For general images - maintain aspect ratio
          const isLandscape = metadata.width > metadata.height;

          if (isLandscape) {
            // Landscape: limit width, let height scale proportionally
            sharpInstance = sharpInstance.resize(compressionConfig.maxDimension, null, {
              fit: "inside",
              withoutEnlargement: true,
            });
          } else {
            // Portrait: limit height, let width scale proportionally
            sharpInstance = sharpInstance.resize(null, compressionConfig.maxDimension, {
              fit: "inside",
              withoutEnlargement: true,
            });
          }
        }
      }

      // Apply format-specific compression
      let quality = compressionConfig.quality;
      let attempts = 0;
      const maxAttempts = 5;

      do {
        attempts++;

        // Configure output based on desired format
        switch (compressionConfig.format) {
          case "webp":
            sharpInstance = sharpInstance.webp({ quality });
            break;
          case "png":
            sharpInstance = sharpInstance.png({
              compressionLevel: Math.floor((100 - quality) / 10),
              quality,
            });
            break;
          case "jpeg":
          default:
            sharpInstance = sharpInstance.jpeg({
              quality,
              progressive: true,
              mozjpeg: true,
            });
            break;
        }

        // Write to temp file
        await sharpInstance.toFile(tempPath);

        // Check compressed file size
        const compressedStats = fs.statSync(tempPath);
        const compressedSize = compressedStats.size;

        // If size is acceptable or we've tried enough times, break
        if (compressedSize <= compressionConfig.targetSize || attempts >= maxAttempts) {
          // Replace original with compressed
          fs.renameSync(tempPath, filePath);

          // Update req.file with new file info
          req.file.size = compressedSize;

          console.log(
            `Image compressed: ${originalSize} bytes → ${compressedSize} bytes (${Math.round(
              (1 - compressedSize / originalSize) * 100
            )}% reduction)`
          );
          break;
        }

        // Reduce quality for next attempt
        quality = Math.max(quality - 15, 20);

        // Reset sharp instance for next iteration
        sharpInstance = sharp(filePath);

        if (needsResize) {
          if (compressionConfig.crop) {
            const size = compressionConfig.maxDimension;
            sharpInstance = sharpInstance.resize(size, size, {
              fit: "cover",
              position: "center",
            });
          } else {
            const isLandscape = metadata.width > metadata.height;
            if (isLandscape) {
              sharpInstance = sharpInstance.resize(compressionConfig.maxDimension, null, {
                fit: "inside",
                withoutEnlargement: true,
              });
            } else {
              sharpInstance = sharpInstance.resize(null, compressionConfig.maxDimension, {
                fit: "inside",
                withoutEnlargement: true,
              });
            }
          }
        }
      } while (attempts < maxAttempts);

      // Clean up temp file if it still exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (error) {
      console.error("Image compression error:", error);
      // Continue without compression if there's an error
    }

    next();
  });
};

// Alternative: Middleware factory for different image types
export const createImageCompressor = (options = {}) => {
  const defaultOptions = {
    maxDimension: 1920, // Single max dimension
    width: null, // Specific width (optional)
    height: null, // Specific height (optional)
    crop: false, // Whether to crop to exact dimensions
    quality: 85,
    targetSize: 1024 * 1024, // 1MB
    format: "jpeg",
    skipIfSmaller: true,
  };

  const config = { ...defaultOptions, ...options };

  return catchAsync(async (req, res, next) => {
    if (!req.file || !req.file.mimetype.startsWith("image/")) {
      return next();
    }

    const filePath = req.file.path;
    const originalStats = fs.statSync(filePath);

    if (config.skipIfSmaller && originalStats.size <= config.targetSize) {
      return next();
    }

    try {
      const tempPath = filePath + ".tmp";
      const metadata = await sharp(filePath).metadata();

      let sharpInstance = sharp(filePath);

      // Handle different resize strategies
      if (config.width && config.height) {
        // Specific dimensions provided
        if (config.crop) {
          sharpInstance = sharpInstance.resize(config.width, config.height, {
            fit: "cover",
            position: "center",
          });
        } else {
          sharpInstance = sharpInstance.resize(config.width, config.height, {
            fit: "inside",
            withoutEnlargement: true,
          });
        }
      } else if (config.maxDimension) {
        // Single max dimension - maintain aspect ratio
        const needsResize =
          metadata.width > config.maxDimension || metadata.height > config.maxDimension;

        if (needsResize) {
          const isLandscape = metadata.width > metadata.height;

          if (isLandscape) {
            sharpInstance = sharpInstance.resize(config.maxDimension, null, {
              fit: "inside",
              withoutEnlargement: true,
            });
          } else {
            sharpInstance = sharpInstance.resize(null, config.maxDimension, {
              fit: "inside",
              withoutEnlargement: true,
            });
          }
        }
      }

      // Apply compression based on format
      switch (config.format.toLowerCase()) {
        case "webp":
          sharpInstance = sharpInstance.webp({ quality: config.quality });
          break;
        case "png":
          sharpInstance = sharpInstance.png({
            compressionLevel: 9,
            quality: config.quality,
          });
          break;
        default:
          sharpInstance = sharpInstance.jpeg({
            quality: config.quality,
            progressive: true,
          });
      }

      await sharpInstance.toFile(tempPath);

      const compressedStats = fs.statSync(tempPath);

      // Only replace if compression actually reduced size
      if (compressedStats.size < originalStats.size) {
        fs.renameSync(tempPath, filePath);
        req.file.size = compressedStats.size;
      } else {
        fs.unlinkSync(tempPath);
      }
    } catch (error) {
      console.error("Compression failed:", error);
    }

    next();
  });
};
