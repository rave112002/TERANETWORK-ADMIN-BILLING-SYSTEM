/**
 * SSRF (Server-Side Request Forgery) Prevention Middleware
 * Protects against OWASP A10: Server-Side Request Forgery
 *
 * Features:
 * - Blocks requests to private/internal IP ranges
 * - Validates URL schemes (only http/https)
 * - Prevents DNS rebinding attacks
 * - Blocks cloud metadata endpoints
 * - Configurable URL whitelist
 */

import dns from "dns";
import { URL } from "url";
import { promisify } from "util";
import APIError from "../utils/APIError.js";

const dnsLookup = promisify(dns.lookup);

/**
 * Private IP ranges that should be blocked (RFC 1918, RFC 4193, etc.)
 */
const PRIVATE_IP_RANGES = [
  /^127\./, // Loopback (127.0.0.0/8)
  /^10\./, // Private Class A (10.0.0.0/8)
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B (172.16.0.0/12)
  /^192\.168\./, // Private Class C (192.168.0.0/16)
  /^169\.254\./, // Link-local (169.254.0.0/16)
  /^0\./, // Invalid (0.0.0.0/8)
  /^224\./, // Multicast (224.0.0.0/4)
  /^240\./, // Reserved (240.0.0.0/4)
  /^255\.255\.255\.255$/, // Broadcast
  /^::1$/, // IPv6 loopback
  /^fe80:/, // IPv6 link-local
  /^fc00:/, // IPv6 unique local
  /^fd00:/, // IPv6 unique local
  /^ff00:/, // IPv6 multicast
];

/**
 * Cloud metadata endpoints that should be blocked
 */
const METADATA_ENDPOINTS = [
  "169.254.169.254", // AWS, Azure, GCP, DigitalOcean
  "metadata.google.internal", // GCP
  "100.100.100.200", // Alibaba Cloud
  "fd00:ec2::254", // AWS IPv6
];

/**
 * Allowed URL schemes
 */
const ALLOWED_SCHEMES = ["http:", "https:"];

/**
 * Check if an IP address is private/internal
 * @param {string} ip - IP address to check
 * @returns {boolean}
 */
export function isPrivateIP(ip) {
  if (!ip) return false;

  // Check against known private ranges
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

/**
 * Check if hostname is a cloud metadata endpoint
 * @param {string} hostname
 * @returns {boolean}
 */
export function isMetadataEndpoint(hostname) {
  return METADATA_ENDPOINTS.some((endpoint) =>
    hostname.toLowerCase().includes(endpoint.toLowerCase())
  );
}

/**
 * Validate URL format and scheme
 * @param {string} urlString
 * @returns {URL} Parsed URL object
 * @throws {APIError} If URL is invalid
 */
export function validateURLFormat(urlString) {
  if (!urlString || typeof urlString !== "string") {
    throw new APIError("Invalid URL: URL must be a non-empty string", 400);
  }

  // Remove whitespace
  urlString = urlString.trim();

  // Check for maximum URL length (prevent DoS)
  if (urlString.length > 2048) {
    throw new APIError(
      "Invalid URL: URL exceeds maximum length (2048 characters)",
      400
    );
  }

  let parsedURL;
  try {
    parsedURL = new URL(urlString);
  } catch (error) {
    throw new APIError(`Invalid URL: ${error.message}`, 400);
  }

  // Validate scheme
  if (!ALLOWED_SCHEMES.includes(parsedURL.protocol)) {
    throw new APIError(
      `Invalid URL scheme: Only ${ALLOWED_SCHEMES.join(", ")} are allowed`,
      400
    );
  }

  // Block URLs with credentials (user:pass@host)
  if (parsedURL.username || parsedURL.password) {
    throw new APIError(
      "Invalid URL: URLs with embedded credentials are not allowed",
      400
    );
  }

  return parsedURL;
}

/**
 * Validate URL against SSRF attacks
 * @param {string} urlString - URL to validate
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.whitelist - Allowed hostnames
 * @param {boolean} options.allowPrivateIPs - Allow private IPs (default: false)
 * @param {boolean} options.performDNSCheck - Perform DNS resolution check (default: true)
 * @returns {Promise<URL>} Validated URL object
 * @throws {APIError} If URL fails validation
 */
export async function validateURL(urlString, options = {}) {
  const {
    whitelist = [],
    allowPrivateIPs = false,
    performDNSCheck = true,
  } = options;

  // Step 1: Validate URL format
  const parsedURL = validateURLFormat(urlString);

  const hostname = parsedURL.hostname.toLowerCase();

  // Step 2: Check against whitelist (if provided)
  if (whitelist.length > 0) {
    const isWhitelisted = whitelist.some((allowed) => {
      const allowedLower = allowed.toLowerCase();
      // Support wildcard subdomain matching: *.example.com
      if (allowedLower.startsWith("*.")) {
        const domain = allowedLower.substring(2);
        return hostname === domain || hostname.endsWith(`.${domain}`);
      }
      return hostname === allowedLower;
    });

    if (!isWhitelisted) {
      throw new APIError(
        `URL not allowed: ${hostname} is not in the whitelist`,
        403
      );
    }
  }

  // Step 3: Block cloud metadata endpoints
  if (isMetadataEndpoint(hostname)) {
    throw new APIError(
      "Forbidden: Access to cloud metadata endpoints is not allowed",
      403
    );
  }

  // Step 4: Check if hostname is an IP address (deterministic IPv4 check to avoid unsafe regex)
  function isIPv4(host) {
    if (typeof host !== "string") return false;
    const parts = host.split(".");
    if (parts.length !== 4) return false;
    for (const part of parts) {
      // each part must be 1-3 digits
      if (part.length === 0 || part.length > 3) return false;
      if (!/^\d+$/.test(part)) return false;
      // no leading zeros for multi-digit parts
      if (part.length > 1 && part[0] === "0") return false;
      const num = Number(part);
      if (num < 0 || num > 255) return false;
    }
    return true;
  }

  if (isIPv4(hostname)) {
    if (!allowPrivateIPs && isPrivateIP(hostname)) {
      throw new APIError(
        `Forbidden: Access to private IP addresses is not allowed (${hostname})`,
        403
      );
    }
  }

  // Step 5: Perform DNS resolution check (prevent DNS rebinding)
  if (performDNSCheck) {
    try {
      const { address } = await dnsLookup(hostname);

      // Check if resolved IP is private
      if (!allowPrivateIPs && isPrivateIP(address)) {
        throw new APIError(
          `Forbidden: URL resolves to a private IP address (${address})`,
          403
        );
      }

      // Check if resolved IP is a metadata endpoint
      if (METADATA_ENDPOINTS.includes(address)) {
        throw new APIError(
          "Forbidden: URL resolves to a cloud metadata endpoint",
          403
        );
      }
    } catch (error) {
      // If DNS lookup fails, it might be a DNS error or SSRF attempt
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`DNS resolution failed: ${error.message}`, 400);
    }
  }

  return parsedURL;
}

/**
 * Express middleware to validate URLs in request body/query
 * @param {Object} config - Configuration
 * @param {Array<string>} config.fields - Fields to validate (e.g., ['url', 'imageUrl'])
 * @param {Array<string>} config.whitelist - Allowed hostnames
 * @param {boolean} config.allowPrivateIPs - Allow private IPs
 * @returns {Function} Express middleware
 */
export function ssrfProtectionMiddleware(config = {}) {
  const { fields = ["url"], whitelist = [], allowPrivateIPs = false } = config;

  return async (req, res, next) => {
    try {
      // Check request body
      if (req.body) {
        for (const field of fields) {
          if (req.body[field]) {
            await validateURL(req.body[field], { whitelist, allowPrivateIPs });
          }
        }
      }

      // Check query parameters
      if (req.query) {
        for (const field of fields) {
          if (req.query[field]) {
            await validateURL(req.query[field], { whitelist, allowPrivateIPs });
          }
        }
      }

      next();
    } catch (error) {
      if (error instanceof APIError) {
        return next(error);
      }
      return next(new APIError("URL validation failed", 400));
    }
  };
}

/**
 * Safe HTTP client wrapper with SSRF protection
 * Use this for making external HTTP requests instead of raw axios/fetch
 *
 * @param {string} urlString - URL to fetch
 * @param {Object} options - Fetch options
 * @param {Array<string>} options.whitelist - Allowed hostnames
 * @param {boolean} options.allowPrivateIPs - Allow private IPs
 * @param {number} options.timeout - Request timeout (default: 10000ms)
 * @returns {Promise<Response>}
 */
export async function safeFetch(urlString, options = {}) {
  const {
    whitelist = [],
    allowPrivateIPs = false,
    timeout = 10000,
    ...fetchOptions
  } = options;

  // Validate URL before making request
  const validatedURL = await validateURL(urlString, {
    whitelist,
    allowPrivateIPs,
  });

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(validatedURL.href, {
      ...fetchOptions,
      signal: controller.signal,
      // Security: Don't follow redirects automatically (prevent redirect-based SSRF)
      redirect: "manual",
    });

    // If response is a redirect, validate the redirect URL
    if (response.status >= 300 && response.status < 400) {
      const redirectURL = response.headers.get("location");
      if (redirectURL) {
        // Validate redirect URL against SSRF
        await validateURL(redirectURL, { whitelist, allowPrivateIPs });
      }
    }

    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new APIError(`Request timeout after ${timeout}ms`, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  validateURL,
  validateURLFormat,
  isPrivateIP,
  isMetadataEndpoint,
  ssrfProtectionMiddleware,
  safeFetch,
};
