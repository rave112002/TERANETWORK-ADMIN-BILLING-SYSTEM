import APIError, { ERROR_CODES } from '../utils/APIError.js';
import { getCurrentTimestampUTC } from '../utils/dateUtils.js';


/**
 * Create idempotency middleware
 *
 * @param {Object} options - Configuration options
 * @param {number} options.ttlHours - Time to live for idempotency keys in hours (default: 24)
 * @returns {Function} Express middleware
 */
export const idempotencyMiddleware = (options = {}) => {
  const { ttlHours = 24 } = options;

  return async (req, res, next) => {
    try {
      // Extract idempotency key from headers (case-insensitive)
      const idempotencyKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];

      if (!idempotencyKey) {
        throw new APIError(
          'Idempotency-Key header is required',
          400,
          ERROR_CODES.INVALID_INPUT
        );
      }

      // Create hash of request body for additional verification
      const crypto = await import('crypto');
      const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(req.body))
        .digest('hex');

      // Check if this idempotency key exists
      const existing = await req.db.query(
        `SELECT
          idempotency_key,
          request_hash,
          response_code,
          response_body,
          expires_at
        FROM idempotency_keys
        WHERE idempotency_key = ?
        LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        const record = existing[0];

        // Check if the key has expired
        if (new Date(record.expires_at) < new Date()) {
          // Expired - delete and allow new request
          await req.db.query(
            'DELETE FROM idempotency_keys WHERE idempotency_key = ?',
            [idempotencyKey]
          );

          req.logger.info('Expired idempotency key deleted', {
            idempotencyKey,
            expiredAt: record.expires_at,
          });
        } else {
          // Key is still valid

          // Verify request hash matches (prevents same key with different body)
          if (record.request_hash !== requestHash) {
            throw new APIError(
              'Idempotency key already used with different request body',
              409,
              ERROR_CODES.DUPLICATE_ENTRY
            );
          }

          // Return cached response
          req.logger.info('Idempotent request detected - returning cached response', {
            idempotencyKey,
            requestHash: requestHash.substring(0, 8),
          });

          return res.status(record.response_code).json(record.response_body);
        }
      }

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = async function (data) {
        const responseCode = res.statusCode || 200;

        // Only cache successful responses (2xx)
        if (responseCode >= 200 && responseCode < 300) {
          try {
            const now = getCurrentTimestampUTC();
            const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 19)
              .replace('T', ' ');

            await req.db.query(
              `INSERT INTO idempotency_keys
              (idempotency_key, request_hash, response_code, response_body, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
              [
                idempotencyKey,
                requestHash,
                responseCode,
                JSON.stringify(data),
                now,
                expiresAt,
              ]
            );

            req.logger.info('Idempotency key stored', {
              idempotencyKey,
              requestHash: requestHash.substring(0, 8),
              expiresAt,
            });
          } catch (error) {
            // Log but don't fail the request if caching fails
            req.logger.error('Failed to store idempotency key', {
              error: error.message,
              idempotencyKey,
            });
          }
        }

        // Call original res.json
        return originalJson(data);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Cleanup expired idempotency keys (should be run periodically via cron/worker)
 *
 * @param {Object} db - Database instance
 * @returns {Promise<number>} Number of deleted records
 */
export const cleanupExpiredKeys = async (db) => {
  try {
    const result = await db.query(
      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
    );

    const deletedCount = result.affectedRows || 0;

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired idempotency keys`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Failed to cleanup expired idempotency keys:', error);
    throw error;
  }
};
