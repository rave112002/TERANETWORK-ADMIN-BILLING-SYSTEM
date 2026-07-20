import crypto from 'crypto';

/**
 * PIISanitizer - Automatically removes or hashes PII from logs
 * GDPR & CCPA compliant logging utility
 */
class PIISanitizer {
  // Fields that should be completely removed from logs
  static PII_FIELDS = [
    'username',
    'email',
    'password',
    'phone',
    'phoneNumber',
    'name',
    'firstName',
    'lastName',
    'fullName',
    'address',
    'ssn',
    'creditCard',
    'dateOfBirth',
    'dob',
  ];

  // Fields that can be hashed for correlation purposes
  static HASHABLE_FIELDS = ['username', 'email'];

  /**
   * Remove PII fields from an object
   * @param {Object} data - Data object to sanitize
   * @param {Object} options - Sanitization options
   * @returns {Object} Sanitized data
   */
  static sanitize(data, options = {}) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const { keepHashed = false, additionalPIIFields = [] } = options;
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    const fieldsToRemove = [...this.PII_FIELDS, ...additionalPIIFields];

    // Handle arrays
    if (Array.isArray(sanitized)) {
      return sanitized.map((item) => this.sanitize(item, options));
    }

    // Handle nested objects
    for (const key in sanitized) {
      const value = sanitized[key];

      // Recursively sanitize nested objects
      if (value && typeof value === 'object') {
        sanitized[key] = this.sanitize(value, options);
        continue;
      }

      // Check if this field contains PII
      const isPIIField = fieldsToRemove.some((piiField) =>
        key.toLowerCase().includes(piiField.toLowerCase())
      );

      if (isPIIField) {
        // Option 1: Keep as hash for correlation
        if (keepHashed && this.HASHABLE_FIELDS.includes(key)) {
          sanitized[`${key}Hash`] = this.hashValue(value);
          delete sanitized[key];
        } else {
          // Option 2: Remove completely
          delete sanitized[key];
        }
      }
    }

    return sanitized;
  }

  /**
   * Hash a value for correlation purposes
   * @param {string} value - Value to hash
   * @returns {string} Hashed value
   */
  static hashValue(value) {
    if (!value) return null;

    const salt = process.env.LOG_SALT || 'default-salt-change-in-production';
    return crypto
      .createHash('sha256')
      .update(String(value) + salt)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Anonymize IP address (keep network, mask host)
   * @param {string} ip - IP address to anonymize
   * @returns {string} Anonymized IP
   */
  static anonymizeIP(ip) {
    if (!ip) return null;

    // IPv4: Keep first 3 octets, mask last
    if (ip.includes('.')) {
      const parts = ip.split('.');
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }

    // IPv6: Keep first 4 groups, mask rest
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return `${parts.slice(0, 4).join(':')}::`;
    }

    return ip;
  }

  /**
   * Create safe context for logging with automatic PII removal
   * @param {Object} context - Context object
   * @param {Object} safeFields - Fields that are explicitly safe to log
   * @returns {Object} Safe context object
   */
  static createSafeContext(context, safeFields = {}) {
    const sanitized = this.sanitize(context, { keepHashed: true });
    return {
      ...sanitized,
      ...safeFields,
    };
  }
}

export default PIISanitizer;