import CircuitBreaker from 'opossum';
import axios from 'axios';
import { logger } from '../../config/logger.js';
import { validateURL } from '../middlewares/ssrf.middleware.js';
import APIError from '../utils/APIError.js';

/**
 * Circuit Breaker configuration for external API calls
 * Protects against cascading failures and provides resilience
 * Now includes SSRF protection for all external requests
 */
const circuitBreakerOptions = {
  timeout: 10000, // 10 seconds timeout
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 10000, // Window for error calculations
  rollingCountBuckets: 10, // Number of buckets in the window
  name: 'external-api-breaker',
  volumeThreshold: 5, // Minimum number of requests before calculating error rate
};

/**
 * Create a circuit breaker for HTTP GET requests
 */
export const createHttpGetBreaker = () => {
  const breaker = new CircuitBreaker(
    async (url, config = {}) => {
      const response = await axios.get(url, {
        ...config,
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return response.data;
    },
    circuitBreakerOptions
  );

  // Event listeners for monitoring
  breaker.on('open', () => {
    logger.error('[Circuit Breaker] Circuit opened - too many failures');
  });

  breaker.on('halfOpen', () => {
    logger.warn('[Circuit Breaker] Circuit half-open - testing service');
  });

  breaker.on('close', () => {
    logger.info('[Circuit Breaker] Circuit closed - service recovered');
  });

  breaker.on('timeout', () => {
    logger.warn('[Circuit Breaker] Request timeout');
  });

  breaker.on('reject', () => {
    logger.warn('[Circuit Breaker] Request rejected - circuit is open');
  });

  breaker.on('failure', (error) => {
    logger.error('[Circuit Breaker] Request failed', {
      error: error.message,
      stack: error.stack,
    });
  });

  breaker.fallback(() => {
    return {
      error: true,
      message: 'Service temporarily unavailable. Please try again later.',
      code: 'CIRCUIT_OPEN',
    };
  });

  return breaker;
};

/**
 * Create a circuit breaker for HTTP POST requests
 */
export const createHttpPostBreaker = () => {
  const breaker = new CircuitBreaker(
    async (url, data, config = {}) => {
      const response = await axios.post(url, data, {
        ...config,
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return response.data;
    },
    circuitBreakerOptions
  );

  // Similar event listeners as GET breaker
  breaker.on('open', () => logger.error('[Circuit Breaker POST] Circuit opened'));
  breaker.on('halfOpen', () => logger.warn('[Circuit Breaker POST] Circuit half-open'));
  breaker.on('close', () => logger.info('[Circuit Breaker POST] Circuit closed'));

  breaker.fallback(() => ({
    error: true,
    message: 'Service temporarily unavailable. Please try again later.',
    code: 'CIRCUIT_OPEN',
  }));

  return breaker;
};

// Export singleton instances
export const httpGetBreaker = createHttpGetBreaker();
export const httpPostBreaker = createHttpPostBreaker();

/**
 * Safe HTTP GET with circuit breaker and SSRF protection
 * @param {string} url - The URL to fetch
 * @param {object} options - Request options
 * @param {object} options.config - Axios config options
 * @param {Array<string>} options.whitelist - Allowed hostnames
 * @param {boolean} options.allowPrivateIPs - Allow private IPs (default: false)
 * @returns {Promise} Response data or fallback
 */
export const safeHttpGet = async (url, options = {}) => {
  const { config = {}, whitelist = [], allowPrivateIPs = false } = options;

  try {
    // SSRF Protection: Validate URL before making request
    await validateURL(url, { whitelist, allowPrivateIPs });

    logger.info('[Safe HTTP GET] Making request', { url });
    return await httpGetBreaker.fire(url, config);
  } catch (error) {
    if (error instanceof APIError) {
      logger.warn('[Safe HTTP GET] SSRF protection blocked request', {
        url,
        reason: error.message,
      });
      throw error;
    }

    logger.error('[Safe HTTP GET] Request failed', {
      url,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Safe HTTP POST with circuit breaker and SSRF protection
 * @param {string} url - The URL to post to
 * @param {object} data - Data to send
 * @param {object} options - Request options
 * @param {object} options.config - Axios config options
 * @param {Array<string>} options.whitelist - Allowed hostnames
 * @param {boolean} options.allowPrivateIPs - Allow private IPs (default: false)
 * @returns {Promise} Response data or fallback
 */
export const safeHttpPost = async (url, data, options = {}) => {
  const { config = {}, whitelist = [], allowPrivateIPs = false } = options;

  try {
    // SSRF Protection: Validate URL before making request
    await validateURL(url, { whitelist, allowPrivateIPs });

    logger.info('[Safe HTTP POST] Making request', { url });
    return await httpPostBreaker.fire(url, data, config);
  } catch (error) {
    if (error instanceof APIError) {
      logger.warn('[Safe HTTP POST] SSRF protection blocked request', {
        url,
        reason: error.message,
      });
      throw error;
    }

    logger.error('[Safe HTTP POST] Request failed', {
      url,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Get circuit breaker health status
 */
export const getCircuitBreakerStatus = () => ({
  get: {
    name: httpGetBreaker.name,
    state: httpGetBreaker.opened ? 'OPEN' : httpGetBreaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
    stats: httpGetBreaker.stats,
  },
  post: {
    name: httpPostBreaker.name,
    state: httpPostBreaker.opened ? 'OPEN' : httpPostBreaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
    stats: httpPostBreaker.stats,
  },
});
