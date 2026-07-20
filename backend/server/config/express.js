import "dotenv/config";

import cookieParser from "cookie-parser";
import express, { json, urlencoded } from "express";
import morgan from "morgan";
import passport from "passport";
import compression from 'compression';
import api from "../src/index.js";
import { csrfErrorHandler } from "../src/middlewares/csrf.middleware.js"; // CSRF error handler
import configureJwtPassport from "../src/middlewares/passport.jwt.config.js"; // your passport JWT configuration
import { responseWrapper } from "../src/middlewares/wrapResponses.js"; // your custom response wrapper
import { requestIdMiddleware } from "../src/middlewares/requestId.middleware.js"; // Request ID tracking
import {
  sanitizeMiddleware,
  securityHeaders,
} from "../src/utils/security.js"; // your CSP nonce middleware
import APIError from "../src/utils/APIError.js"; // your custom error class
import { error } from "../src/utils/responses.js"; // your custom error handling function
import Database from "./database.js";
import { httpLogger, logger, maskSensitiveData } from "./logger.js"; // your winston logger setup
// import { apiLimiter } from "../src/middlewares/rateLimiter.js"; // Rate limiter middleware
import { loggerMiddleware } from "../src/middlewares/logger.middleware.js"; // Global logger middleware

const app = express();
// Configure trust proxy to get real client IP behind reverse proxy
// Trust loopback, linklocal, and uniquelocal addresses
// Adjust based on your infrastructure (nginx, load balancer, etc.)
// app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
app.set("trust proxy", 1);

// Initialize database instance (single source of truth)
const db = new Database();




if (process.env.NODE_ENV === "development") {
  // 1. Log all HTTP requests to the terminal (or a general Winston transport)
  app.use(morgan("dev")); // 'dev' format is concise for terminal
} else {
  // 2. Log only error responses (4xx and 5xx) to a specific Winston transport
  app.use(
    morgan(
      (tokens, req, res) => {
        return [
          `[${tokens.status(req, res)}]`,
          tokens.method(req, res),
          tokens.url(req, res),
          "-",
          tokens["response-time"](req, res),
          "ms",
        ].join(" ");
      },
      {
        skip: (req, res) => res.statusCode < 400,
        stream: {
          write: (message) => logger.error(`HTTP Error: ${message.trim()}`),
        },
      }
    )
  );
}

// cors origins
const origins = [
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : []),
];
const options = {
  isDevelopment: process.env.NODE_ENV === "development",
  allowedOrigins: [...new Set(origins)],
  enableRateLimit: true,
  enableCSP: false,
};
// Apply security headers
app.use(...securityHeaders(options));

// Generate unique request ID for tracing (must be early in the chain)
app.use(requestIdMiddleware);

// Enhanced bot protection with blocking
app.use((req, res, next) => {
  const userAgent = req.get("User-Agent") || "";

  // Whitelist of legitimate bots
  const legitimateBots = [
    "Googlebot",
    "Bingbot",
    "Slackbot",
    "DuckDuckBot",
    "Baiduspider",
    "YandexBot",
    "facebookexternalhit",
  ];

  // Check if it's a bot
  const isBot =
    userAgent.toLowerCase().includes("bot") ||
    userAgent.toLowerCase().includes("crawler") ||
    userAgent.toLowerCase().includes("spider") ||
    userAgent.toLowerCase().includes("scraper");

  // Check if it's a legitimate bot
  const isLegitimateBot = legitimateBots.some((bot) => userAgent.includes(bot));

  // Block suspicious bots
  if (isBot && !isLegitimateBot) {
    logger.warn(`Blocked suspicious bot from ${req.ip}`, {
      userAgent: userAgent,
      method: req.method,
      url: req.originalUrl,
    });

    return res.status(403).json({
      success: false,
      message: "Access denied",
      code: "BOT_BLOCKED",
    });
  }

  // Block requests with no user agent (often malicious)
  if (!userAgent || userAgent.trim().length === 0) {
    logger.warn(`Blocked request with no User-Agent from ${req.ip}`, {
      method: req.method,
      url: req.originalUrl,
    });

    return res.status(403).json({
      success: false,
      message: "Access denied",
      code: "NO_USER_AGENT",
    });
  }

  next();
});

// Set EJS as view engine (if any rendering is needed)
app.set("view engine", "ejs");

// Customize JSON.stringify behavior for all responses
app.set("json replacer", (key, value) => {
  if (typeof value === "string" && value.includes("public\\")) {
    return value.replace(/\\/g, "/");
  }

  return value;
});

// Parse incoming JSON and URL-encoded data (with increased size limit)
app.use(json({ limit: "2mb" }));
app.use(urlencoded({ limit: "2mb", extended: true }));

// Parse cookies (required for CSRF protection)
app.use(cookieParser());

// Apply response compression
app.use(compression())

// Apply input sanitization middleware (XSS, injection prevention)
// This runs AFTER body parsing to sanitize all incoming data
app.use(sanitizeMiddleware);

// Serve static files from /public
app.use("/public", express.static("public"));

// Misc server settings
app.set("json spaces", 2);
app.set("case sensitive routing", false);
app.set("strict routing", true);
app.set("x-powered-by", false);

// Initialize Passport and configure JWT strategy
app.use(passport.initialize());
configureJwtPassport(db);

// Add custom audit logger middleware
app.use(responseWrapper);

// Attach DevLogger globally to all requests
app.use(loggerMiddleware);

// app.use('/api/', apiLimiter);
//Routes
app.use((req, res, next) => {
  req.db = db;

  next();
});
app.use(api);

// CSRF Error Handler - Must be before global error handlers
app.use(csrfErrorHandler);

// Global Error Handler for non-APIError instances (fallback)
app.use((err, req, res, next) => {
  const sensitiveFields = [
    "password",
    "oldPassword",
    "newPassword",
    "pin",
    "email",
  ];

  const maskedBody = req.body
    ? maskSensitiveData(req.body, sensitiveFields)
    : {};
  const maskedQuery = req.query
    ? maskSensitiveData(req.query, sensitiveFields)
    : {};
  const maskedParams = req.params
    ? maskSensitiveData(req.params, sensitiveFields)
    : {};

  // Log the full error details using Winston

  // Check if the error is an APIError (you created this class for controlled errors)
  if (!(err instanceof APIError)) {
    // In development, pass the original error
    const msg =
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal Server Error";

    httpLogger.error(msg, {
      requestId: req.requestId,
      message: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      body: maskedBody, // Be cautious about logging sensitive data in production
      query: maskedQuery,
      params: maskedParams,
    });

    // Log the full error in development for debugging
    if (process.env.NODE_ENV === "development") {
      console.error("=== FULL ERROR DETAILS ===");
      console.error("Error:", err);
      console.error("Stack:", err.stack);
      console.error("==========================");
    }

    const apiError = new APIError(msg, 500);
    return next(apiError); // Re-throw as an APIError
  }

  // If the error is an instance of APIError, proceed to the next handler
  return next(err);
});

// 404 error handler (API not found)
app.use((req, res, next) => {
  const err = new APIError("API not found", 404);
  return next(err);
});

// Final error handler to format the response to the client
// IMPORTANT: Must have 4 parameters (err, req, res, next) for Express to recognize it as an error handler
app.use((err, req, res, _next) => {
  // Default to 500 if status is not set
  let statusCode = err.status || 500;

  // In production: show 4xx error messages (client errors), hide 5xx messages (server errors)
  // In development: always show the actual error message
  let message;
  if (process.env.NODE_ENV === "production") {
    // For 4xx errors (client errors), show the actual message
    // For 5xx errors (server errors), hide the details unless isPublic is true
    if (statusCode >= 400 && statusCode < 500) {
      message = err.message || "Bad Request";
    } else {
      message = err.isPublic ? err.message : "An unexpected error occurred";
    }
  } else {
    message = err.message || "An unexpected error occurred";
  }

  // Handle duplicate key errors specifically
  if (err.message && err.message.includes("Duplicate")) {
    statusCode = 409;
    if (process.env.NODE_ENV === "production") {
      message =
        "A unique constraint violation occurred. Please check the input.";
    }
  }

  // Log APIError instances to files as well
  // Only log errors (status >= 500) to error log, 4xx are client errors
  if (statusCode >= 500) {
    logger.error("API Error (5xx)", {
      requestId: req.requestId,
      message: err.message,
      statusCode,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
  } else if (statusCode >= 400) {
    // Log 4xx client errors to combined log (info level)
    logger.info("API Error (4xx)", {
      requestId: req.requestId,
      message: err.message,
      statusCode,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    });
  }

  return error(
    res,
    message,
    process.env.NODE_ENV === "development" ? err.stack : {},
    statusCode,
    err.code || 'INTERNAL_ERROR' // Include error code
  );
});

// Export both app and database instance
export default app;
export { db };
