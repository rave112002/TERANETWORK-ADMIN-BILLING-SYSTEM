import { logger } from '../../config/logger.js';
import PIISanitizer from './piiSanitizer.js';

/**
 * Development-only logger wrapper
 * Prevents console.log statements from reaching production
 * and provides structured logging in development
 */
class DevLogger {
  /**
   * Log development information
   * Only logs in development environment
   */
  static log(...args) {
    if (process.env.NODE_ENV === 'development') {
      // Sanitize each argument if it's an object
      const sanitizedArgs = args.map((arg) =>
        typeof arg === 'object' ? PIISanitizer.sanitize(arg) : arg
      );
      logger.debug('[DEV]', ...sanitizedArgs);
    }
  }

  /**
   * Log errors with proper structure
   * Logs in all environments but with appropriate level
   */
  static error(message, error, context = {}) {
    const sanitizedContext = PIISanitizer.sanitize(context);
    if (process.env.NODE_ENV === 'development') {
      logger.error(message, {
        error: error?.message,
        stack: error?.stack,
        ...sanitizedContext,
      });
    } else {
      // In production, log less verbose error info
      logger.error(message, {
        error: error?.message,
        ...sanitizedContext,
      });
    }
  }

  /**
   * Log warnings
   */
  static warn(message, context = {}) {
    const sanitizedContext = PIISanitizer.sanitize(context);
    logger.warn(message, sanitizedContext);
  }

  /**
   * Log info messages
   */
  static info(message, context = {}) {
    const sanitizedContext = PIISanitizer.sanitize(context);
    logger.info(message, sanitizedContext);
  }

  /**
   * Log database query results (development only)
   */
  static queryResult(query, result, context = {}) {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedContext = PIISanitizer.sanitize(context);
      logger.debug('[DB Query Result]', {
        query: query.substring(0, 200),
        rowCount: Array.isArray(result) ? result.length : 'N/A',
        ...sanitizedContext,
      });
    }
  }

  /**
   * Log request parameters (development only)
   */
  static requestParams(req, additionalInfo = {}) {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedAdditional = PIISanitizer.sanitize(additionalInfo);
      const sanitizedParams = PIISanitizer.sanitize(req.params);
      const sanitizedQuery = PIISanitizer.sanitize(req.query);
      const sanitizedBody = PIISanitizer.sanitize(req.body);

      logger.debug('[Request Params]', {
        method: req.method,
        url: req.originalUrl,
        params: sanitizedParams,
        query: sanitizedQuery,
        body: sanitizedBody,
        ip: PIISanitizer.anonymizeIP(req.ip),
        ...sanitizedAdditional,
      });
    }
  }

  /**
   * Log file upload information
   */
  static fileUpload(file, context = {}) {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedContext = PIISanitizer.sanitize(context);
      logger.debug('[File Upload]', {
        filename: file?.filename,
        originalname: file?.originalname, // This might contain PII!
        mimetype: file?.mimetype,
        size: file?.size,
        // path removed - could contain PII in directory structure
        ...sanitizedContext,
      });
    }
  }

  /**
   * Create safe security audit log
   * Use this for login/logout events
   */
  static securityEvent(eventType, userId, req, additionalData = {}) {
    const sanitizedData = PIISanitizer.sanitize(additionalData);

    logger.info('Security Event', {
      event: eventType,
      userId: userId, // Safe - internal ID only
      ip: PIISanitizer.anonymizeIP(req?.ip),
      userAgent: req?.get('User-Agent'),
      timestamp: new Date().toISOString(),
      ...sanitizedData,
    });
  }
}

export default DevLogger;
