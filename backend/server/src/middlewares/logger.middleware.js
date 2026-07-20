import DevLogger from '../utils/devLogger.js';

/**
 * Middleware to attach DevLogger to request object
 * Makes logger available as req.logger in all routes
 */
export const loggerMiddleware = (req, res, next) => {
  // Attach DevLogger to request object
  req.logger = DevLogger;

  // Also attach request context for convenience
  req.logContext = () => ({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  next();
};
