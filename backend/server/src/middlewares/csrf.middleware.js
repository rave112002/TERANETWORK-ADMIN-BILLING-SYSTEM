import { doubleCsrf } from "csrf-csrf";
import APIError from "../utils/APIError.js";
import crypto from "node:crypto";
/**
 * Double CSRF Protection
 * Implements double-submit cookie pattern for CSRF protection
 *
 * How it works:
 * 1. Client requests a CSRF token via GET /api/csrf-token
 * 2. Server generates token pair: hash (cookie) + token (response)
 * 3. Client includes token in request header: x-csrf-token
 * 4. Server validates token matches cookie hash
 *
 * Usage:
 * - Add csrfProtection middleware to state-changing routes (POST, PUT, PATCH, DELETE)
 * - Exclude GET/HEAD/OPTIONS from CSRF validation
 * - Use generateToken() to get tokens for frontend
 *
 * ============================================================================
 * ENVIRONMENT CONFIGURATION
 * ============================================================================
 *
 * Scenario 1: Local Development (both HTTP, cross-origin)
 *   NODE_ENV=development
 *   DISABLE_CSRF=true  (Required! HTTP cross-origin cannot use cookies for POST)
 *   - Or use a frontend proxy to make requests same-origin
 *
 * Scenario 2: Hybrid Development (frontend HTTP local, backend HTTPS server)
 *   NODE_ENV=development
 *   COOKIE_SECURE=true
 *   ALLOW_CROSS_SITE_CSRF=true
 *   - Frontend must use: credentials: 'include' in fetch/axios
 *   - Backend CORS must have: credentials: true
 *
 * Scenario 3: Production (both HTTPS, same origin)
 *   NODE_ENV=production
 *   CSRF_SECRET=<random-32-char-string>
 *   - Cookies work automatically with same-origin
 *
 * ============================================================================
 */

const csrfSecret =
  process.env.CSRF_SECRET ||
  "change-this-secret-in-production-to-random-32-chars";

if (
  csrfSecret === "change-this-secret-in-production-to-random-32-chars" &&
  process.env.NODE_ENV === "production"
) {
  throw new Error("CSRF_SECRET must be set in production environment");
}

// ============================================================================
// Cookie Configuration
// ============================================================================

const isProduction = process.env.NODE_ENV === "production";
const allowCrossSite = process.env.ALLOW_CROSS_SITE_CSRF === "true";
const forceSecure = process.env.COOKIE_SECURE === "true";

/**
 * Determine cookie settings based on environment
 *
 * | Scenario                  | sameSite | secure | Notes                          |
 * |---------------------------|----------|--------|--------------------------------|
 * | Production (same-origin)  | strict   | true   | Maximum security               |
 * | Hybrid (cross-site HTTPS) | none     | true   | Requires credentials: include  |
 * | Local dev (same-origin)   | lax      | false  | Standard dev setup             |
 * | Local dev (cross-origin)  | lax      | false  | Won't work! Use DISABLE_CSRF   |
 */
const getCookieConfig = () => {
  // Cross-site requests (Scenario 2: frontend HTTP, backend HTTPS)
  if (allowCrossSite) {
    if (!forceSecure && !isProduction) {
      console.warn(
        "⚠️  ALLOW_CROSS_SITE_CSRF=true requires COOKIE_SECURE=true or HTTPS backend. " +
        "Cross-origin cookies will NOT work over HTTP. Use DISABLE_CSRF=true for local HTTP dev."
      );
    }
    return {
      sameSite: "none",
      secure: true, // Required for sameSite=none
    };
  }

  // Production same-origin (Scenario 3)
  if (isProduction) {
    return {
      sameSite: "strict",
      secure: true,
    };
  }

  // Local development same-origin (Scenario 1 with proxy, or standard dev)
  return {
    sameSite: "lax",
    secure: forceSecure, // Usually false for local HTTP
  };
};

const cookieConfig = getCookieConfig();
// Use __Host- prefix only in production (requires HTTPS and path=/)
const cookieName = isProduction ? "__Host-csrf" : "csrf-token";

// Log configuration on startup
console.log("CSRF Configuration:", {
  isProduction,
  allowCrossSite,
  forceSecure,
  cookieName,
  cookieOptions: { ...cookieConfig, path: "/", httpOnly: true, maxAge: 3600000 },
});

const {
  generateCsrfToken: generateToken, // Use this to create CSRF tokens
  doubleCsrfProtection, // Use this to protect routes
} = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (req) => {
    // Use session ID if available, otherwise use a combination of user agent and IP
    if (req.session?.id || req.sessionID) {
      const sessionId = req.session?.id || req.sessionID;
      if (!isProduction) {
        console.log("CSRF session identifier (session):", sessionId.substring(0, 10) + "...");
      }
      return sessionId;
    }

    // Fallback: Generate a session identifier from IP and User-Agent
    // This provides reasonable CSRF protection without requiring express-session
    const userAgent = req.get('user-agent') || 'unknown';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const identifier = `${ip}-${userAgent}`;

    // Hash the identifier for privacy and consistent length
    const hash = crypto.createHash('sha256').update(identifier).digest('hex');
    if (!isProduction) {
      console.log("CSRF session identifier (fallback):", { ip, uaStart: userAgent.substring(0, 30), hash: hash.substring(0, 10) });
    }
    return hash;
  },
  cookieName,
  cookieOptions: {
    ...cookieConfig,
    path: "/",
    httpOnly: true, // Cannot be accessed via JavaScript
    maxAge: 3600000, // 1 hour
  },
  size: 64, // Token size in bytes
  ignoredMethods: ["GET", "HEAD", "OPTIONS"], // Methods that don't need CSRF protection
  getCsrfTokenFromRequest: (req) => {
    // Check multiple locations for CSRF token
    const token = req.headers["x-csrf-token"] ||
      req.headers["x-xsrf-token"] ||
      req.body?._csrf ||
      req.query?._csrf;
    if (!isProduction) {
      console.log("CSRF token from request:", token ? token.substring(0, 20) + "..." : "none");
    }
    return token;
  },
});

/**
 * CSRF Protection Middleware
 * Apply this to routes that need CSRF protection
 *
 * To disable CSRF in development for testing (e.g., Postman), set:
 * DISABLE_CSRF=true in your .env file
 */
const isCsrfDisabled = process.env.DISABLE_CSRF === "true";
export const csrfProtection = (req, res, next) => {
  if (isProduction && isCsrfDisabled) {
    throw new APIError(
      "CSRF protection cannot be disabled in production",
      500,
      "CSRF_PROTECTION_ERROR"
    );
  }

  if (!isProduction && isCsrfDisabled) {
    req.logger?.warn("CSRF protection disabled in non-production environment");
    return next();
  }

  // Skip CSRF for browser extensions in development (cookies don't work well)
  if (!isProduction) {
    const origin = req.get("origin") || req.get("referer");
    if (origin && (
      origin.startsWith("chrome-extension://") ||
      origin.startsWith("moz-extension://") ||
      origin.startsWith("safari-extension://") ||
      origin.startsWith("ms-browser-extension://")
    )) {
      req.logger?.info("Skipping CSRF validation for browser extension in development", {
        origin,
        method: req.method,
        url: req.originalUrl,
      });
      return next();
    }
  }

  // Add debugging for CSRF failures in development
  const wrappedNext = (err) => {
    if (err && !isProduction) {
      const debugInfo = {
        error: err.message,
        code: err.code,
        hasToken: !!req.headers["x-csrf-token"],
        tokenValue: req.headers["x-csrf-token"]?.substring(0, 20) + "...",
        hasCookie: !!req.cookies?.["csrf-token"] || !!req.cookies?.["__Host-csrf"],
        cookieValue: (req.cookies?.["csrf-token"] || req.cookies?.["__Host-csrf"])?.substring(0, 20) + "...",
        cookies: Object.keys(req.cookies || {}),
        method: req.method,
        url: req.originalUrl,
        sessionId: req.session?.id || req.sessionID || "no-session",
      };
      console.log("CSRF validation error details:", debugInfo);
    }
    next(err);
  };

  return doubleCsrfProtection(req, res, wrappedNext);
};

/**
 * Generate CSRF Token
 * Use this to create tokens for the frontend
 */
export const generateCsrfToken = generateToken;

/**
 * CSRF Token Generation Endpoint Handler
 * Creates a route that returns CSRF tokens to the frontend
 */
export const csrfTokenHandler = (req, res) => {
  const token = generateToken(req, res);

  // Set the cookie (automatically handled by generateToken)
  return res.json({
    success: true,
    csrfToken: token,
    message:
      "CSRF token generated. Include this in x-csrf-token header for state-changing requests.",
  });
};

/**
 * Error handler for CSRF validation failures
 */
export const csrfErrorHandler = (err, req, res, next) => {
  // Check for CSRF-related errors
  const isCsrfError =
    err.code === "EBADCSRFTOKEN" ||
    err.message?.toLowerCase().includes("csrf") ||
    err.message?.toLowerCase().includes("invalid csrf token");
  console.log("isCsrfError: ",isCsrfError,err.code, err.message);
  if (isCsrfError) {
    req.logger?.warn("CSRF validation failed", {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      errorMessage: err.message,
    });

    return res.status(403).json({
      success: false,
      message: "Invalid or expired CSRF token. Please refresh and try again.",
      code: "CSRF_VALIDATION_FAILED",
    });
  }

  next(err);
};

/**
 * Origin Validation Middleware
 * Additional security layer to validate request origin
 * Use this before CSRF protection for defense in depth
 *
 * Environment Variables:
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins (e.g., "http://localhost:3000,https://app.example.com")
 * - FRONTEND_URL: Single frontend URL (legacy support)
 * - PRODUCTION_URL: Production URL (legacy support)
 */
export const validateOrigin = (req, res, next) => {
  // Build allowed origins list from environment variables
  let allowedOrigins = [];

  // Primary method: Use ALLOWED_ORIGINS env variable (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    allowedOrigins = process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  } else {
    // Fallback: Use legacy env variables + development defaults
    const devDefaults =
      process.env.NODE_ENV === "development"
        ? [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:5173",
            "http://localhost:4200",
          ]
        : [];

    allowedOrigins = [
      ...devDefaults,
      process.env.FRONTEND_URL,
      process.env.PRODUCTION_URL,
    ].filter(Boolean);
  }

  // Log allowed origins in development for debugging
  if (process.env.NODE_ENV === "development" && allowedOrigins.length > 0) {
    req.logger?.info("Allowed origins for CSRF validation", {
      allowedOrigins,
      configuredVia: process.env.ALLOWED_ORIGINS
        ? "ALLOWED_ORIGINS"
        : "legacy env vars",
    });
  }

  // Only validate for state-changing methods
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const origin = req.get("origin") || req.get("referer");

  // If no allowed origins are configured, allow all in development, block all in production
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === "development") {
      req.logger?.warn(
        "No allowed origins configured - allowing all requests in development mode"
      );
      return next();
    } else {
      req.logger?.error(
        "No allowed origins configured in production - blocking request",
        {
          origin,
          method: req.method,
          url: req.originalUrl,
        }
      );
      return res.status(403).json({
        success: false,
        message: "Origin validation not configured",
        code: "ORIGIN_CONFIG_ERROR",
      });
    }
  }

  // Check if origin/referer exists
  if (!origin) {
    req.logger?.warn("Request missing origin/referer header", {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    // In development, allow requests without origin (for tools like Postman)
    if (process.env.NODE_ENV === "development") {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Request origin validation failed",
      code: "MISSING_ORIGIN",
    });
  }

  // Allow Chrome extensions and browser extensions in development
  if (process.env.NODE_ENV === "development") {
    if (origin.startsWith("chrome-extension://") ||
        origin.startsWith("moz-extension://") ||
        origin.startsWith("safari-extension://") ||
        origin.startsWith("ms-browser-extension://")) {
      req.logger?.info("Allowing browser extension origin in development", {
        origin,
        method: req.method,
        url: req.originalUrl,
      });
      return next();
    }
  }

  // Validate origin is in allowed list
  try {
    const originUrl = new URL(origin);
    const isAllowed = allowedOrigins.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return originUrl.origin === allowedUrl.origin;
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      req.logger?.warn("Invalid origin detected", {
        origin,
        allowedOrigins,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
      });

      // In development, provide helpful error message
      const message =
        process.env.NODE_ENV === "development"
          ? `Origin '${origin}' not allowed. Allowed origins: ${allowedOrigins.join(
              ", "
            )}`
          : "Request origin not allowed";

      return res.status(403).json({
        success: false,
        message,
        code: "INVALID_ORIGIN",
      });
    }

    next();
  } catch (error) {
    req.logger?.error("Origin validation error", {
      origin,
      error: error.message,
    });

    return res.status(403).json({
      success: false,
      message: "Invalid request origin",
      code: "INVALID_ORIGIN",
    });
  }
};
