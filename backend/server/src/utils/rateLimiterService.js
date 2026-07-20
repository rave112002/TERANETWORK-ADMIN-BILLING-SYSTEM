/**
 * Rate Limiter Service
 *
 * Production-ready rate limiting using rate-limiter-flexible.
 * Supports both single-instance (memory) and multi-instance (Redis/MySQL) deployments.
 *
 * Features:
 * - Multiple limit profiles (API, Auth, Upload, etc.)
 * - Configurable via environment variables
 * - Redis support for clustered deployments
 * - Graceful fallback to memory store
 * - Block duration for repeated violations
 * - Atomic operations (no race conditions)
 *
 * Environment Variables:
 * - RATE_LIMIT_STORE: 'memory' | 'redis' | 'mysql' (default: 'memory')
 * - RATE_LIMIT_REDIS_HOST: Redis host (default: 'localhost')
 * - RATE_LIMIT_REDIS_PORT: Redis port (default: 6379)
 * - RATE_LIMIT_REDIS_PASSWORD: Redis password (optional)
 * - RATE_LIMIT_KEY_PREFIX: Key prefix for rate limit keys (default: 'rl')
 *
 * Profile-specific overrides (optional):
 * - RATE_LIMIT_API_POINTS: Max requests for API limiter
 * - RATE_LIMIT_API_DURATION: Window duration in seconds for API limiter
 * - RATE_LIMIT_AUTH_POINTS: Max requests for Auth limiter
 * - RATE_LIMIT_AUTH_DURATION: Window duration in seconds for Auth limiter
 */

import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterMySQL,
  RateLimiterUnion,
  BurstyRateLimiter,
} from "rate-limiter-flexible";
import { logger } from "../../config/logger.js";

/**
 * Rate limit profiles configuration
 * Each profile defines limits for different use cases
 */
const PROFILES = {
  // General API requests
  api: {
    points: parseInt(process.env.RATE_LIMIT_API_POINTS || "100", 10),
    duration: parseInt(process.env.RATE_LIMIT_API_DURATION || "900", 10), // 15 minutes
    blockDuration: parseInt(process.env.RATE_LIMIT_API_BLOCK || "0", 10), // No block by default
    keyPrefix: "api",
  },

  // Authentication endpoints (login, register)
  auth: {
    points: parseInt(process.env.RATE_LIMIT_AUTH_POINTS || "10", 10),
    duration: parseInt(process.env.RATE_LIMIT_AUTH_DURATION || "900", 10), // 15 minutes
    blockDuration: parseInt(process.env.RATE_LIMIT_AUTH_BLOCK || "900", 10), // Block for 15 min after limit
    keyPrefix: "auth",
  },

  // File uploads
  upload: {
    points: parseInt(process.env.RATE_LIMIT_UPLOAD_POINTS || "20", 10),
    duration: parseInt(process.env.RATE_LIMIT_UPLOAD_DURATION || "3600", 10), // 1 hour
    blockDuration: parseInt(process.env.RATE_LIMIT_UPLOAD_BLOCK || "0", 10),
    keyPrefix: "upload",
  },

  // Password reset
  passwordReset: {
    points: parseInt(process.env.RATE_LIMIT_PWRESET_POINTS || "3", 10),
    duration: parseInt(process.env.RATE_LIMIT_PWRESET_DURATION || "3600", 10), // 1 hour
    blockDuration: parseInt(process.env.RATE_LIMIT_PWRESET_BLOCK || "3600", 10), // Block for 1 hour
    keyPrefix: "pwreset",
  },

  // CSRF token requests
  csrf: {
    points: parseInt(process.env.RATE_LIMIT_CSRF_POINTS || "30", 10),
    duration: parseInt(process.env.RATE_LIMIT_CSRF_DURATION || "900", 10), // 15 minutes
    blockDuration: parseInt(process.env.RATE_LIMIT_CSRF_BLOCK || "0", 10),
    keyPrefix: "csrf",
  },

  // Strict limiter for sensitive operations
  strict: {
    points: parseInt(process.env.RATE_LIMIT_STRICT_POINTS || "5", 10),
    duration: parseInt(process.env.RATE_LIMIT_STRICT_DURATION || "3600", 10), // 1 hour
    blockDuration: parseInt(process.env.RATE_LIMIT_STRICT_BLOCK || "7200", 10), // Block for 2 hours
    keyPrefix: "strict",
  },
};

/**
 * Store instances cache
 * Prevents creating multiple instances for the same profile
 */
const limiters = new Map();

/**
 * Redis client instance (shared across limiters)
 */
let redisClient = null;

/**
 * MySQL pool instance (shared across limiters)
 */
let mysqlPool = null;

/**
 * Get the configured store type
 * @returns {'memory' | 'redis' | 'mysql'}
 */
function getStoreType() {
  return process.env.RATE_LIMIT_STORE || "memory";
}

/**
 * Get the key prefix for rate limit keys
 * @returns {string}
 */
function getKeyPrefix() {
  return process.env.RATE_LIMIT_KEY_PREFIX || "rl";
}

/**
 * Initialize Redis client for rate limiting
 * @returns {Promise<Object|null>} Redis client or null if not configured
 */
async function initRedisClient() {
  if (redisClient) return redisClient;

  if (getStoreType() !== "redis") return null;

  try {
    // Dynamic import to avoid requiring redis when not needed
    const { createClient } = await import("redis");

    const host = process.env.RATE_LIMIT_REDIS_HOST || process.env.REDIS_HOST || "localhost";
    const port = parseInt(process.env.RATE_LIMIT_REDIS_PORT || process.env.REDIS_PORT || "6379", 10);
    const password = process.env.RATE_LIMIT_REDIS_PASSWORD || process.env.REDIS_PASSWORD;

    redisClient = createClient({
      socket: {
        host,
        port,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error("Redis rate limiter: Max reconnection attempts reached");
            return new Error("Max reconnection attempts reached");
          }
          return Math.min(retries * 100, 3000);
        },
      },
      password: password || undefined,
    });

    redisClient.on("error", (err) => {
      logger.error("Redis rate limiter error", { error: err.message });
    });

    redisClient.on("connect", () => {
      logger.info("Redis rate limiter connected", { host, port });
    });

    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.warn("Failed to initialize Redis for rate limiting, falling back to memory", {
      error: error.message,
    });
    return null;
  }
}

/**
 * Initialize MySQL pool for rate limiting
 * @param {Object} pool - MySQL pool instance from database.js
 * @returns {Object|null}
 */
function initMySQLPool(pool) {
  if (mysqlPool) return mysqlPool;

  if (getStoreType() !== "mysql") return null;

  if (!pool) {
    logger.warn("MySQL pool not provided for rate limiting, falling back to memory");
    return null;
  }

  mysqlPool = pool;
  return mysqlPool;
}

/**
 * Create a rate limiter instance for a specific profile
 *
 * @param {string} profileName - Name of the profile (api, auth, upload, etc.)
 * @param {Object} options - Override options
 * @returns {Promise<Object>} Rate limiter instance
 */
async function createLimiter(profileName, options = {}) {
  const cacheKey = `${profileName}-${JSON.stringify(options)}`;

  if (limiters.has(cacheKey)) {
    return limiters.get(cacheKey);
  }

  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unknown rate limit profile: ${profileName}`);
  }

  const config = {
    points: options.points ?? profile.points,
    duration: options.duration ?? profile.duration,
    blockDuration: options.blockDuration ?? profile.blockDuration,
    keyPrefix: `${getKeyPrefix()}:${options.keyPrefix || profile.keyPrefix}`,
  };

  let limiter;
  const storeType = getStoreType();

  try {
    switch (storeType) {
      case "redis": {
        const client = await initRedisClient();
        if (client) {
          limiter = new RateLimiterRedis({
            storeClient: client,
            ...config,
            insuranceLimiter: new RateLimiterMemory({
              ...config,
              keyPrefix: `${config.keyPrefix}:insurance`,
            }),
          });
          logger.debug(`Rate limiter created: ${profileName} (Redis)`, config);
        } else {
          // Fallback to memory
          limiter = new RateLimiterMemory(config);
          logger.debug(`Rate limiter created: ${profileName} (Memory fallback)`, config);
        }
        break;
      }

      case "mysql": {
        if (mysqlPool) {
          limiter = new RateLimiterMySQL({
            storeClient: mysqlPool,
            dbName: process.env.DB_DATABASE,
            tableName: "rate_limits",
            ...config,
            insuranceLimiter: new RateLimiterMemory({
              ...config,
              keyPrefix: `${config.keyPrefix}:insurance`,
            }),
          });
          logger.debug(`Rate limiter created: ${profileName} (MySQL)`, config);
        } else {
          limiter = new RateLimiterMemory(config);
          logger.debug(`Rate limiter created: ${profileName} (Memory fallback)`, config);
        }
        break;
      }

      default: {
        limiter = new RateLimiterMemory(config);
        logger.debug(`Rate limiter created: ${profileName} (Memory)`, config);
      }
    }
  } catch (error) {
    logger.error(`Failed to create ${storeType} rate limiter, using memory`, {
      profile: profileName,
      error: error.message,
    });
    limiter = new RateLimiterMemory(config);
  }

  limiters.set(cacheKey, limiter);
  return limiter;
}

/**
 * Create a bursty rate limiter that allows short bursts
 *
 * @param {string} profileName - Base profile name
 * @param {number} burstPoints - Additional burst allowance
 * @param {number} burstDuration - Burst window duration in seconds
 * @returns {Promise<Object>} Bursty rate limiter
 */
async function createBurstyLimiter(profileName, burstPoints = 5, burstDuration = 10) {
  const baseLimiter = await createLimiter(profileName);
  const burstLimiter = new RateLimiterMemory({
    points: burstPoints,
    duration: burstDuration,
    keyPrefix: `${getKeyPrefix()}:burst:${profileName}`,
  });

  return new BurstyRateLimiter(baseLimiter, burstLimiter);
}

/**
 * Get client identifier from request
 * Respects trust proxy settings
 *
 * @param {Object} req - Express request object
 * @returns {string} Client identifier (IP address)
 */
function getClientKey(req) {
  // Express's req.ip respects trust proxy setting
  const ip =
    req.ip ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  return ip;
}

/**
 * Consume a point from the rate limiter
 *
 * @param {string} profileName - Profile to use
 * @param {string} key - Client identifier
 * @param {number} points - Points to consume (default: 1)
 * @returns {Promise<Object>} Rate limiter result
 */
async function consume(profileName, key, points = 1) {
  const limiter = await createLimiter(profileName);
  return limiter.consume(key, points);
}

/**
 * Get current rate limit status without consuming
 *
 * @param {string} profileName - Profile to use
 * @param {string} key - Client identifier
 * @returns {Promise<Object|null>} Rate limiter result or null
 */
async function get(profileName, key) {
  const limiter = await createLimiter(profileName);
  return limiter.get(key);
}

/**
 * Reset rate limit for a specific key
 *
 * @param {string} profileName - Profile to use
 * @param {string} key - Client identifier
 * @returns {Promise<boolean>} Success status
 */
async function reset(profileName, key) {
  const limiter = await createLimiter(profileName);
  return limiter.delete(key);
}

/**
 * Block a key for a specified duration
 *
 * @param {string} profileName - Profile to use
 * @param {string} key - Client identifier
 * @param {number} durationSeconds - Block duration in seconds
 * @returns {Promise<Object>} Rate limiter result
 */
async function block(profileName, key, durationSeconds) {
  const limiter = await createLimiter(profileName);
  return limiter.block(key, durationSeconds);
}

/**
 * Penalty - consume extra points as punishment
 *
 * @param {string} profileName - Profile to use
 * @param {string} key - Client identifier
 * @param {number} points - Penalty points
 * @returns {Promise<Object>} Rate limiter result
 */
async function penalty(profileName, key, points) {
  const limiter = await createLimiter(profileName);
  return limiter.penalty(key, points);
}

/**
 * Reward - give back points (e.g., after successful action)
 *
 * @param {string} profileName - Profile to use
 * @param {string} key - Client identifier
 * @param {number} points - Reward points
 * @returns {Promise<Object>} Rate limiter result
 */
async function reward(profileName, key, points) {
  const limiter = await createLimiter(profileName);
  return limiter.reward(key, points);
}

/**
 * Close all rate limiter connections
 * Call this during graceful shutdown
 */
async function close() {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info("Redis rate limiter connection closed");
    } catch (error) {
      logger.error("Error closing Redis rate limiter connection", { error: error.message });
    }
    redisClient = null;
  }

  limiters.clear();
}

/**
 * Get all available profiles
 * @returns {Object} Profile configurations
 */
function getProfiles() {
  return { ...PROFILES };
}

/**
 * Get rate limiter statistics (for monitoring)
 * @returns {Object} Statistics
 */
function getStats() {
  return {
    storeType: getStoreType(),
    keyPrefix: getKeyPrefix(),
    profiles: Object.keys(PROFILES),
    activeLimiters: limiters.size,
    redisConnected: redisClient?.isOpen ?? false,
  };
}

export {
  createLimiter,
  createBurstyLimiter,
  getClientKey,
  consume,
  get,
  reset,
  block,
  penalty,
  reward,
  close,
  getProfiles,
  getStats,
  initRedisClient,
  initMySQLPool,
  PROFILES,
};

export default {
  createLimiter,
  createBurstyLimiter,
  getClientKey,
  consume,
  get,
  reset,
  block,
  penalty,
  reward,
  close,
  getProfiles,
  getStats,
  initRedisClient,
  initMySQLPool,
  PROFILES,
};
