import moment from "moment-timezone";

/**
 * Date/Time Utility Functions
 *
 * TIMEZONE STRATEGY:
 * - All dates stored in database as UTC (YYYY-MM-DD HH:mm:ss format)
 * - All internal processing uses UTC
 * - API responses include ISO 8601 format with timezone (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - User display timezone (Asia/Manila) applied at frontend
 *
 * MIGRATION GUIDE:
 * Replace all instances of:
 *   moment().tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss")
 * With:
 *   getCurrentTimestampUTC()
 */

const DEFAULT_TIMEZONE = process.env.TIMEZONE || "Asia/Manila";

/**
 * Get current timestamp in UTC for database storage
 *
 * @returns {string} UTC timestamp in MySQL DATETIME format (YYYY-MM-DD HH:mm:ss)
 */
export function getCurrentTimestampUTC() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
}

export function getTodayDateUTC() {
  return moment.utc().format("YYYY-MM-DD");
}

export function addHoursUTC(hours) {
  return moment.utc().add(hours, "hours").format("YYYY-MM-DD HH:mm:ss");
}

export function addDaysUTC(days) {
  return moment.utc().add(days, "days").format("YYYY-MM-DD HH:mm:ss");
}

export function getCurrentTimeInTimezone(timezone = DEFAULT_TIMEZONE) {
  return moment().tz(timezone).format("HH:mm:ss");
}

/**
 * Convert UTC timestamp to user's timezone for display
 *
 * @param {string|Date} utcTimestamp - UTC timestamp from database
 * @param {string} timezone - Target timezone (default: Asia/Manila)
 * @returns {string} Formatted timestamp in user's timezone
 */
export function toUserTimezone(utcTimestamp, timezone = DEFAULT_TIMEZONE) {
  return moment.utc(utcTimestamp).tz(timezone).format("YYYY-MM-DD HH:mm:ss");
}

/**
 * Parse user-provided timestamp and convert to UTC for storage
 * Handles multiple input formats
 *
 * @param {string|Date} input - User-provided timestamp (any format)
 * @param {string} sourceTimezone - Source timezone (default: Asia/Manila)
 * @returns {string} UTC timestamp for database storage
 */
export function parseToUTC(input, sourceTimezone = DEFAULT_TIMEZONE) {
  // Handle ISO 8601 format (already has timezone info)
  if (
    typeof input === "string" &&
    input.includes("T") &&
    (input.includes("Z") || input.includes("+"))
  ) {
    return moment(input).utc().format("YYYY-MM-DD HH:mm:ss");
  }

  // Handle naive datetime (assume source timezone)
  return moment.tz(input, sourceTimezone).utc().format("YYYY-MM-DD HH:mm:ss");
}

/**
 * Format database timestamp for API response
 * Converts UTC to ISO 8601 with timezone
 *
 * @param {string|Date} dbTimestamp - Timestamp from database (UTC)
 * @returns {string|null} ISO 8601 timestamp
 */
export function formatForAPI(dbTimestamp) {
  if (!dbTimestamp) return null;
  return moment.utc(dbTimestamp).toISOString();
}

/**
 * Format multiple database records for API response
 * Converts all date fields to ISO 8601
 *
 * @param {Object|Array} data - Database record(s)
 * @param {Array<string>} dateFields - Field names containing dates
 * @returns {Object|Array} Formatted data
 */
export function formatDatesForAPI(
  data,
  dateFields = ["dateCreated", "dateUpdated", "createdAt", "updatedAt"]
) {
  if (Array.isArray(data)) {
    return data.map((item) => formatDatesForAPI(item, dateFields));
  }

  if (typeof data === "object" && data !== null) {
    const formatted = { ...data };

    dateFields.forEach((field) => {
      if (formatted[field]) {
        formatted[field] = formatForAPI(formatted[field]);
      }
    });

    return formatted;
  }

  return data;
}

/**
 * Get date range for queries (start and end of day in UTC)
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} timezone - User's timezone
 * @returns {Object} { start: UTC timestamp, end: UTC timestamp }
 */
export function getDateRangeUTC(date, timezone = DEFAULT_TIMEZONE) {
  const start = moment.tz(date, timezone).startOf("day").utc().format("YYYY-MM-DD HH:mm:ss");
  const end = moment.tz(date, timezone).endOf("day").utc().format("YYYY-MM-DD HH:mm:ss");

  return { start, end };
}

// Re-export moment for advanced use cases
export { moment };
