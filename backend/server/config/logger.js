import path from "path";
import { fileURLToPath } from "url";
import winston from "winston";
import "winston-daily-rotate-file";
const { format } = winston;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, "../../logs");

// Shared human-readable line format for file transports.
// `format.errors({ stack: true })` ensures that when an Error object is passed
// (e.g. logger.error(err) or logger.error("msg", { error: err })), the full
// stack trace is captured rather than just the message string.
const fileLineFormat = format.combine(
  format.errors({ stack: true }),
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const base = `${timestamp} [${level}]: ${message}`;
    const trace = stack ? `\n${stack}` : "";
    const rest =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${base}${rest}${trace}`;
  })
);

// Define different transports for different log levels and destinations
const consoleTransport = new winston.transports.Console({
  level: process.env.NODE_ENV === "development" ? "debug" : "info", // Log messages with severity 'info' and above to console
  format: format.combine(
    format.colorize(),
    format.errors({ stack: true }),
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const trace = stack ? `\n${stack}` : "";
      return `${timestamp} [${level}]: ${message} ${
        Object.keys(meta).length > 0 ? JSON.stringify(meta) : ""
      }${trace}`;
    })
  ),
});

const fileErrorTransport = new winston.transports.DailyRotateFile({
  level: "error", // Log only error level messages to this file
  filename: path.join(LOG_DIR, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "7d",
  format: fileLineFormat,
});

// Add file transport for all logs (info, warn, error, debug)
const fileAllTransport = new winston.transports.DailyRotateFile({
  level: "info", // Log info and above (info, warn, error)
  filename: path.join(LOG_DIR, "combined-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d", // Keep for 14 days
  format: fileLineFormat,
});

// Create the logger instance
// For general application logging
export const logger = winston.createLogger({
  transports: [
    consoleTransport, // Logs all 'info' and above to console
    fileErrorTransport, // Only logs 'error' to error-*.log
    fileAllTransport, // Logs 'info' and above to combined-*.log
  ],
  exceptionHandlers: [
    // Print fatal exceptions to the terminal so crashes are never silent
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
        })
      ),
    }),
    // Rotate the crash log daily and keep full structured detail (stack,
    // process info, os) as JSON - same rich format you saw in exceptions.log.
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "exceptions-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
  rejectionHandlers: [
    // Print unhandled rejections to the terminal as well
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
        })
      ),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "rejections-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
});

// HTTP logger for logging request logs (optional, could be for errors only as well)
export const httpLogger = winston.createLogger({
  transports: [
    new winston.transports.DailyRotateFile({
      level: "error", // Log only 'error' HTTP requests
      filename: path.join(LOG_DIR, "http-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "7d",
      format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
      ),
    }),
  ],
});

export const maskSensitiveData = (data, sensitiveKeys) => {
  if (data === null || typeof data !== "object") {
    return data;
  }

  const maskedData = Array.isArray(data) ? [] : {};

  for (const key in data) {
    if (Object.hasOwnProperty.call(data, key)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((sensitiveKey) =>
        lowerKey.includes(sensitiveKey.toLowerCase())
      );

      if (isSensitive && data[key] !== undefined) {
        maskedData[key] = "***"; // Replace with **
      } else {
        maskedData[key] = maskSensitiveData(data[key], sensitiveKeys); // Recursive call
      }
    }
  }

  return maskedData;
};
