/**
 * File Integrity and Security Scanning Service
 * Protects against OWASP A08: Software and Data Integrity Failures
 *
 * Features:
 * - File signature (magic number) validation
 * - MIME type verification
 * - Malware pattern detection
 * - File size validation
 * - Hash-based integrity checks
 * - Suspicious content detection
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import APIError from "../APIError.js";

/**
 * File signatures (magic numbers) for common file types
 * First bytes of files that identify their type
 */
const FILE_SIGNATURES = {
  // Images
  "image/jpeg": [{ signature: [0xff, 0xd8, 0xff], offset: 0 }],
  "image/png": [{ signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
  "image/gif": [
    { signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 }, // GIF87a
    { signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 }, // GIF89a
  ],
  "image/webp": [
    { signature: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF
    { signature: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // WEBP
  ],
  "image/bmp": [{ signature: [0x42, 0x4d], offset: 0 }],
  "image/svg+xml": [
    { signature: [0x3c, 0x73, 0x76, 0x67], offset: 0 }, // <svg
    { signature: [0x3c, 0x3f, 0x78, 0x6d, 0x6c], offset: 0 }, // <?xml
  ],

  // Documents
  "application/pdf": [
    { signature: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  ],
  "application/zip": [
    { signature: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // PK..
    { signature: [0x50, 0x4b, 0x05, 0x06], offset: 0 }, // PK.. (empty archive)
    { signature: [0x50, 0x4b, 0x07, 0x08], offset: 0 }, // PK..
  ],

  // Office documents (also ZIP-based)
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    // .docx
    { signature: [0x50, 0x4b, 0x03, 0x04], offset: 0 },
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    // .xlsx
    { signature: [0x50, 0x4b, 0x03, 0x04], offset: 0 },
  ],
};

/**
 * Suspicious patterns that might indicate malicious files
 * These are simple heuristics and not comprehensive
 */
const SUSPICIOUS_PATTERNS = [
  // Executable headers
  {
    pattern: Buffer.from([0x4d, 0x5a]),
    description: "DOS/Windows executable (MZ header)",
  },
  {
    pattern: Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    description: "Linux ELF executable",
  },
  { pattern: Buffer.from("#!/bin/sh"), description: "Shell script" },
  { pattern: Buffer.from("#!/bin/bash"), description: "Bash script" },
  { pattern: Buffer.from("<?php"), description: "PHP code" },

  // Script injections in images
  { pattern: Buffer.from("<script"), description: "JavaScript in image (XSS)" },
  {
    pattern: Buffer.from("java" + "script:"),
    description: "JavaScript protocol",
  },
  { pattern: Buffer.from("onerror="), description: "JavaScript event handler" },
  { pattern: Buffer.from("onload="), description: "JavaScript event handler" },

  // Server-side includes
  { pattern: Buffer.from("<!--#"), description: "Server-side include" },

  // Null bytes (path traversal attempts)
  {
    pattern: Buffer.from([0x00]),
    description: "Null byte (possible path traversal)",
  },
];

/**
 * Calculate file hash (SHA-256)
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function calculateFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash("sha256");
  hash.update(fileBuffer);
  return hash.digest("hex");
}

/**
 * Read file signature (magic numbers)
 * @param {string} filePath - Path to file
 * @param {number} bytesToRead - Number of bytes to read (default: 32)
 * @returns {Promise<Buffer>} File header bytes
 */
export async function readFileSignature(filePath, bytesToRead = 32) {
  const fileHandle = await fs.open(filePath, "r");
  const buffer = Buffer.alloc(bytesToRead);

  try {
    await fileHandle.read(buffer, 0, bytesToRead, 0);
    return buffer;
  } finally {
    await fileHandle.close();
  }
}

/**
 * Verify file signature matches expected MIME type
 * @param {string} filePath - Path to file
 * @param {string} expectedMimeType - Expected MIME type
 * @returns {Promise<boolean>} True if signature matches
 */
export async function verifyFileSignature(filePath, expectedMimeType) {
  const signatures = FILE_SIGNATURES[expectedMimeType];

  if (!signatures) {
    // If we don't have signature rules for this type, skip verification
    return true;
  }

  const fileHeader = await readFileSignature(filePath);

  // Check if any signature matches
  for (const { signature, offset } of signatures) {
    let matches = true;
    for (let i = 0; i < signature.length; i++) {
      if (fileHeader[offset + i] !== signature[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }

  return false;
}

/**
 * Scan file for suspicious patterns
 * @param {string} filePath - Path to file
 * @param {number} maxBytesToScan - Maximum bytes to scan (default: 1MB)
 * @returns {Promise<Array>} Array of detected suspicious patterns
 */
export async function scanForSuspiciousPatterns(filePath, maxBytesToScan = 1024 * 1024) {
  try {
    const stats = await fs.stat(filePath);
    const bytesToRead = Math.min(stats.size, maxBytesToScan);

    const fileBuffer = await fs.readFile(filePath, { encoding: null });
    const scanBuffer = fileBuffer.slice(0, bytesToRead);

    const detectedPatterns = [];

    for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
      // Search for pattern in buffer
      const index = scanBuffer.indexOf(pattern);
      if (index !== -1) {
        detectedPatterns.push({
          description,
          offset: index,
          pattern: pattern.toString("hex"),
        });
      }
    }

    return detectedPatterns;
  } catch (error) {
    // Log error but don't crash - return empty array to continue processing
    console.error("Error scanning for suspicious patterns:", error);
    throw error; // Re-throw so the caller can handle it
  }
}

/**
 * Validate file extension matches MIME type
 * @param {string} filename - Original filename
 * @param {string} mimeType - Detected MIME type
 * @param {Object} allowedTypes - Allowed MIME types and extensions
 * @returns {boolean}
 */
export function validateFileExtension(filename, mimeType, allowedTypes) {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions = allowedTypes[mimeType];

  if (!allowedExtensions) {
    return false;
  }

  return allowedExtensions.includes(ext);
}

/**
 * Comprehensive file security scan
 * @param {Object} file - File object from multer
 * @param {Object} options - Scan options
 * @param {Object} options.allowedTypes - Allowed MIME types and extensions
 * @param {number} options.maxFileSize - Maximum file size in bytes
 * @param {boolean} options.strictMode - Enable strict validation (default: true)
 * @param {boolean} options.scanSuspiciousPatterns - Scan for malware patterns (default: true)
 * @returns {Promise<Object>} Scan result
 * @throws {APIError} If file fails security checks
 */
export async function scanFile(file, options = {}) {
  const {
    allowedTypes = {},
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    strictMode = true,
    scanSuspiciousPatterns = true,
  } = options;

  const scanResult = {
    passed: true,
    checks: {
      fileExists: false,
      sizeValid: false,
      mimeTypeAllowed: false,
      extensionValid: false,
      signatureValid: false,
      noSuspiciousPatterns: false,
    },
    fileHash: null,
    suspiciousPatterns: [],
    errors: [],
  };

  try {
    // Check 1: File exists
    try {
      await fs.access(file.path);
      scanResult.checks.fileExists = true;
    } catch (_error) {
      scanResult.passed = false;
      scanResult.errors.push("File does not exist");
      throw new APIError("File not found", 404);
    }

    // Check 2: File size
    const stats = await fs.stat(file.path);
    if (stats.size > maxFileSize) {
      scanResult.passed = false;
      scanResult.errors.push(`File size exceeds maximum allowed (${maxFileSize} bytes)`);
      throw new APIError(
        `File too large. Maximum size: ${(maxFileSize / (1024 * 1024)).toFixed(2)}MB`,
        400
      );
    }
    scanResult.checks.sizeValid = true;

    // Check 3: MIME type allowed
    if (!allowedTypes[file.mimetype]) {
      scanResult.passed = false;
      scanResult.errors.push(`MIME type not allowed: ${file.mimetype}`);
      throw new APIError(
        `File type not allowed. Allowed types: ${Object.keys(allowedTypes).join(", ")}`,
        400
      );
    }
    scanResult.checks.mimeTypeAllowed = true;

    // Check 4: File extension matches MIME type
    const extensionValid = validateFileExtension(file.originalname, file.mimetype, allowedTypes);
    if (!extensionValid) {
      scanResult.passed = false;
      scanResult.errors.push(`File extension does not match MIME type (${file.mimetype})`);
      throw new APIError(
        `File extension mismatch. Expected: ${allowedTypes[file.mimetype].join(", ")}`,
        400
      );
    }
    scanResult.checks.extensionValid = true;

    // Check 5: File signature verification (magic numbers)
    if (strictMode) {
      const signatureValid = await verifyFileSignature(file.path, file.mimetype);
      if (!signatureValid) {
        scanResult.passed = false;
        scanResult.errors.push("File signature does not match MIME type");
        throw new APIError("File appears to be corrupted or has incorrect type", 400);
      }
      scanResult.checks.signatureValid = true;
    } else {
      scanResult.checks.signatureValid = true; // Skip in non-strict mode
    }

    // Check 6: Scan for suspicious patterns
    if (scanSuspiciousPatterns) {
      // Only scan first 1KB for image files (reduces false positives)
      const scanSize = file.mimetype?.startsWith("image/") ? 1024 : 1024 * 1024;
      const suspiciousPatterns = await scanForSuspiciousPatterns(file.path, scanSize);
      console.log("suspiciousPatterns: ", suspiciousPatterns);
      scanResult.suspiciousPatterns = suspiciousPatterns;

      // Ensure suspiciousPatterns is an array (defensive programming)
      if (!Array.isArray(suspiciousPatterns)) {
        throw new APIError(
          "File security scan failed: Unable to scan for suspicious patterns",
          500
        );
      }

      // Filter out common false positives for images
      const realThreats = suspiciousPatterns.filter((pattern) => {
        // For image files, ignore null bytes and MZ headers found deep in the file
        if (file.mimetype?.startsWith("image/")) {
          // Ignore null bytes (common in image compression)
          if (pattern.description.includes("Null byte")) {
            return false;
          }
          // Ignore MZ header if found beyond the first 512 bytes (not in actual header)
          if (pattern.description.includes("MZ header") && pattern.offset > 512) {
            return false;
          }
        }
        return true;
      });

      if (realThreats.length > 0) {
        scanResult.passed = false;
        scanResult.checks.noSuspiciousPatterns = false;

        const descriptions = realThreats.map((p) => p.description).join(", ");
        scanResult.errors.push(`Suspicious patterns detected: ${descriptions}`);

        throw new APIError("File contains suspicious content and has been rejected", 400);
      }
      scanResult.checks.noSuspiciousPatterns = true;
    } else {
      scanResult.checks.noSuspiciousPatterns = true;
    }

    // Check 7: Calculate file hash for integrity
    scanResult.fileHash = await calculateFileHash(file.path);

    return scanResult;
  } catch (error) {
    // If it's already an APIError, re-throw it
    if (error instanceof APIError) {
      throw error;
    }

    // Otherwise, wrap it
    scanResult.passed = false;
    scanResult.errors.push(error.message);
    throw new APIError(`File security scan failed: ${error.message}`, 500);
  }
}

/**
 * Express middleware for file integrity scanning
 * Use after multer upload middleware
 * @param {Object} options - Scan options
 * @returns {Function} Express middleware
 */
export function fileIntegrityMiddleware(options = {}) {
  return async (req, res, next) => {
    // If no file uploaded, skip
    if (!req.file && (!req.files || req.files.length === 0)) {
      return next();
    }

    try {
      // Single file upload
      if (req.file) {
        const scanResult = await scanFile(req.file, options);
        req.fileScanResult = scanResult;
      }

      // Multiple file uploads
      if (req.files && Array.isArray(req.files)) {
        const scanResults = [];
        for (const file of req.files) {
          const scanResult = await scanFile(file, options);
          scanResults.push(scanResult);
        }
        req.fileScanResults = scanResults;
      }

      next();
    } catch (error) {
      // Clean up uploaded file on scan failure
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          await fs.unlink(file.path).catch(() => {});
        }
      }

      next(error);
    }
  };
}

/**
 * Verify file integrity using hash
 * @param {string} filePath - Path to file
 * @param {string} expectedHash - Expected SHA-256 hash
 * @returns {Promise<boolean>} True if hash matches
 */
export async function verifyFileIntegrity(filePath, expectedHash) {
  const actualHash = await calculateFileHash(filePath);
  return actualHash === expectedHash;
}

/**
 * Generate integrity metadata for a file
 * @param {string} filePath - Path to file
 * @returns {Promise<Object>} Integrity metadata
 */
export async function generateFileIntegrityMetadata(filePath) {
  const stats = await fs.stat(filePath);
  const hash = await calculateFileHash(filePath);

  return {
    hash,
    algorithm: "sha256",
    size: stats.size,
    timestamp: new Date().toISOString(),
  };
}

export default {
  calculateFileHash,
  readFileSignature,
  verifyFileSignature,
  scanForSuspiciousPatterns,
  validateFileExtension,
  scanFile,
  fileIntegrityMiddleware,
  verifyFileIntegrity,
  generateFileIntegrityMetadata,
};
