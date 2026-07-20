import { v4 as uuidv4 } from "uuid";

/**
 * Request ID Middleware
 *
 * Generates a unique request ID for each incoming request for tracing and debugging.
 * If a request ID is already present in the headers (e.g., from a load balancer or gateway),
 * it will be reused to maintain correlation across services.
 *
 * Features:
 * - Generates UUID v4 for new requests
 * - Respects existing X-Request-Id header
 * - Attaches request ID to req object for use in logging
 * - Sets X-Request-Id response header for client correlation
 *
 * Usage:
 *   // In express.js config
 *   import { requestIdMiddleware } from './middlewares/requestId.middleware.js';
 *   app.use(requestIdMiddleware);
 *
 *   // In controllers/services
 *   console.log(req.requestId); // Access the request ID
 *
 *   // In logger
 *   logger.info('Processing request', { requestId: req.requestId });
 */
export const requestIdMiddleware = (req, res, next) => {
  // Check for existing request ID from upstream services (load balancer, API gateway, etc.)
  const existingId =
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    req.headers["x-trace-id"];

  // Use existing ID or generate a new UUID v4
  const requestId = existingId || uuidv4();

  // Attach to request object for use throughout the request lifecycle
  req.requestId = requestId;

  // Also attach as correlationId for distributed tracing terminology
  req.correlationId = requestId;

  // Set response header so clients can correlate responses
  res.setHeader("X-Request-Id", requestId);

  // Continue to next middleware
  next();
};

/**
 * Get request ID from request object
 * Utility function for use in services that receive the request object
 *
 * @param {Object} req - Express request object
 * @returns {string} Request ID or 'unknown' if not set
 */
export const getRequestId = (req) => {
  return req?.requestId || req?.correlationId || "unknown";
};

export default requestIdMiddleware;
