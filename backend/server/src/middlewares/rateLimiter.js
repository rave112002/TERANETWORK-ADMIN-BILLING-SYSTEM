/**
 * Rate Limiter Middleware
 *
 * Express middleware for rate limiting using rate-limiter-flexible.
 * Provides production-ready rate limiting with support for:
 * - Single instance (memory) deployments
 * - Multi-instance (Redis/MySQL) clustered deployments
 * - Multiple limit profiles
 * - Configurable via environment variables
 *
 * @module middlewares/rateLimiter
 */

import {
  createLimiter,
  getClientKey,
  reward,
  PROFILES,
} from "../utils/rateLimiterService.js";

/**
 * Rate limit response headers
 * @param {Object} res - Express response object
 * @param {Object} rateLimiterRes - Rate limiter result
 * @param {number} points - Total points allowed
 */
function setRateLimitHeaders(res, rateLimiterRes, points) {
  const resetTime = new Date(Date.now() + rateLimiterRes.msBeforeNext);

  // Standard headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
  res.setHeader("RateLimit-Limit", points);
  res.setHeader("RateLimit-Remaining", Math.max(0, rateLimiterRes.remainingPoints));
  res.setHeader("RateLimit-Reset", Math.ceil(resetTime.getTime() / 1000));

  // Retry-After header when limit exceeded
  if (rateLimiterRes.remainingPoints <= 0) {
    res.setHeader("Retry-After", Math.ceil(rateLimiterRes.msBeforeNext / 1000));
  }
}

/**
 * Create rate limit error response
 * @param {string} message - Error message
 * @param {number} retryAfter - Seconds until retry allowed
 * @returns {Object} Error response body
 */
function createRateLimitResponse(message, retryAfter) {
  return {
    success: false,
    message,
    code: "RATE_LIMIT_EXCEEDED",
    retryAfter: `${retryAfter} seconds`,
  };
}

/**
 * Create rate limiter middleware
 *
 * @param {string} profileName - Rate limit profile name (api, auth, upload, etc.)
 * @param {Object} options - Override options
 * @param {number} options.points - Max points (requests) in window
 * @param {number} options.duration - Window duration in seconds
 * @param {number} options.blockDuration - Block duration after limit exceeded (seconds)
 * @param {string} options.message - Custom error message
 * @param {Function} options.keyGenerator - Custom key generator function
 * @param {Function} options.skip - Function to skip rate limiting
 * @param {boolean} options.skipSuccessfulRequests - Don't count 2xx responses
 * @param {boolean} options.skipFailedRequests - Don't count non-2xx responses
 * @returns {Function} Express middleware
 */
export function createRateLimiterMiddleware(profileName, options = {}) {
  const {
    message = "Too many requests, please try again later.",
    keyGenerator = getClientKey,
    skip = null,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  // Get profile for configuration
  const profile = PROFILES[profileName] || PROFILES.api;
  const points = options.points ?? profile.points;

  // Pre-create the limiter to avoid async in middleware hot path
  let limiterPromise = null;

  const getLimiter = () => {
    if (!limiterPromise) {
      limiterPromise = createLimiter(profileName, options);
    }
    return limiterPromise;
  };

  return async (req, res, next) => {
    // Check if should skip
    if (skip && skip(req, res)) {
      return next();
    }

    const key = keyGenerator(req);

    // Log in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[Rate Limit: ${profileName}] Client: ${key}`);
    }

    try {
      const limiter = await getLimiter();
      const rateLimiterRes = await limiter.consume(key, 1);

      // Set rate limit headers
      setRateLimitHeaders(res, rateLimiterRes, points);

      // Handle skipSuccessfulRequests / skipFailedRequests
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalEnd = res.end;

        res.end = function (...args) {
          res.end = originalEnd;

          const statusCode = res.statusCode;
          const isSuccess = statusCode >= 200 && statusCode < 300;

          // Reward (give back the point) if conditions met
          if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
            reward(profileName, key, 1).catch(() => {
              // Ignore reward errors silently
            });
          }

          return res.end.apply(this, args);
        };
      }

      next();
    } catch (rateLimiterRes) {
      // Rate limit exceeded
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

      // Set headers
      setRateLimitHeaders(res, rateLimiterRes, points);

      // Log rate limit hit
      if (process.env.NODE_ENV !== "test") {
        const logger = req.logger || console;
        if (typeof logger.warn === "function") {
          logger.warn(`Rate limit exceeded: ${profileName}`, {
            key,
            profile: profileName,
            retryAfter,
          });
        } else {
          console.warn(`Rate limit exceeded: ${profileName} - ${key}`);
        }
      }

      return res.status(429).json(createRateLimitResponse(message, retryAfter));
    }
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */

/**
 * General API rate limiter
 * Default: 100 requests per 15 minutes
 */
export const apiLimiter = createRateLimiterMiddleware("api", {
  message: "Too many requests from this IP, please try again later.",
  skipSuccessfulRequests: false,
  skip: (req) => {
    // Skip health check endpoints
    const skipPaths = ["/health", "/ready", "/live"];
    return skipPaths.some((path) => req.path.endsWith(path));
  },
});

/**
 * Authentication rate limiter (login, register)
 * Default: 10 attempts per 15 minutes, blocked for 15 min after exceeding
 */
export const authLimiter = createRateLimiterMiddleware("auth", {
  message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * File upload rate limiter
 * Default: 20 uploads per hour
 */
export const uploadLimiter = createRateLimiterMiddleware("upload", {
  message: "Too many upload requests from this IP, please try again later.",
});

/**
 * Password reset rate limiter
 * Default: 3 requests per hour, blocked for 1 hour after exceeding
 */
export const passwordResetLimiter = createRateLimiterMiddleware("passwordReset", {
  message: "Too many password reset requests from this IP, please try again later.",
});

/**
 * CSRF token rate limiter
 * Default: 30 requests per 15 minutes
 */
export const csrfTokenLimiter = createRateLimiterMiddleware("csrf", {
  message: "Too many token requests from this IP, please try again later.",
});

/**
 * Strict rate limiter for sensitive operations
 * Default: 5 requests per hour, blocked for 2 hours after exceeding
 */
export const strictLimiter = createRateLimiterMiddleware("strict", {
  message: "Too many attempts. This action has been temporarily restricted.",
});

/**
 * Dynamic rate limiter - creates middleware with custom settings on the fly
 *
 * @param {Object} options - Rate limiter options
 * @param {number} options.points - Max requests in window
 * @param {number} options.duration - Window duration in seconds
 * @param {string} options.message - Error message
 * @returns {Function} Express middleware
 *
 * @example
 * // 5 requests per minute
 * router.post('/sensitive', dynamicLimiter({ points: 5, duration: 60 }), handler);
 */
export function dynamicLimiter(options) {
  return createRateLimiterMiddleware("api", {
    ...options,
    keyGenerator: options.keyGenerator || getClientKey,
  });
}

/**
 * User-based rate limiter (uses user ID instead of IP)
 *
 * @param {string} profileName - Profile to use
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/action', authenticate, userRateLimiter('api'), handler);
 */
export function userRateLimiter(profileName, options = {}) {
  return createRateLimiterMiddleware(profileName, {
    ...options,
    keyGenerator: (req) => {
      // Use user ID if authenticated, fallback to IP
      return req.user?.accountId || req.user?.id || getClientKey(req);
    },
  });
}

/**
 * Composite rate limiter - combines IP and user-based limiting
 *
 * @param {string} profileName - Profile to use
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
export function compositeRateLimiter(profileName, options = {}) {
  const ipLimiter = createRateLimiterMiddleware(profileName, options);
  const userLimiterMw = userRateLimiter(profileName, {
    ...options,
    // User limits can be slightly higher
    points: Math.floor((PROFILES[profileName]?.points || 100) * 1.5),
  });

  return async (req, res, next) => {
    // Run IP limiter first
    ipLimiter(req, res, (err) => {
      if (err) return next(err);

      // If authenticated, also check user limit
      if (req.user) {
        return userLimiterMw(req, res, next);
      }

      next();
    });
  };
}

// Re-export utility function
export { getClientKey };

export default {
  createRateLimiterMiddleware,
  apiLimiter,
  authLimiter,
  uploadLimiter,
  passwordResetLimiter,
  csrfTokenLimiter,
  strictLimiter,
  dynamicLimiter,
  userRateLimiter,
  compositeRateLimiter,
  getClientKey,
};
