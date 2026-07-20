import mysql from "mysql2/promise";
import { logger } from "./logger.js";

/**
 * Database class for managing MySQL connections and queries using a connection pool.
 *
 * Production-grade configuration with:
 * - UTF-8 MB4 character set for full Unicode support (including emoji)
 * - Connection pooling with health checks and monitoring
 * - Timeout and keep-alive configuration
 * - UTC timezone enforcement
 * - Transaction support with automatic rollback
 * - Slow query logging and performance monitoring
 */
class Database {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize the database connection pool.
   * Must be called before using any database methods.
   */
  async initialize() {
    try {
      // Validate required environment variables
      this.validateEnvVariables();

      // Create connection pool with optimized configuration
      const poolConfig = {
        // Connection credentials
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_DATABASE,
        port: parseInt(process.env.DB_PORT || "3306"),

        // Character encoding - CRITICAL for Unicode/Emoji support
        charset: "utf8mb4",

        // Timezone - Store all dates in UTC
        timezone: "Z",

        // Security settings
        multipleStatements: false, // Prevent SQL injection

        // Pool size configuration
        connectionLimit: parseInt(process.env.DB_POOL_SIZE || "10"),

        // Queue configuration
        waitForConnections: true,
        queueLimit: process.env.NODE_ENV === "development" ? 50 : 500, // Unlimited queue (adjust for production)

        // Idle connection management
        maxIdle: parseInt(process.env.DB_MAX_IDLE || "10"),
        idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || "60000"), // 60 seconds

        // Connection timeout
        connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || "10000"), // 10 seconds

        // Keep-alive to prevent connection drops
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000, // 10 seconds

        // Data type handling
        decimalNumbers: true, // Return decimals as numbers
        dateStrings: false, // Return dates as Date objects

        // Named placeholders support (optional but useful)
        namedPlaceholders: true,
      };

      this.pool = mysql.createPool(poolConfig);

      // Test the connection
      await this.testConnection();

      // Log pool creation
      logger.info("Database connection pool initialized", {
        host: poolConfig.host,
        database: poolConfig.database,
        connectionLimit: poolConfig.connectionLimit,
        charset: poolConfig.charset,
        timezone: poolConfig.timezone,
      });

      // Set up pool event handlers
      this.setupPoolEventHandlers();

      return this.pool;
    } catch (error) {
      logger.error("Failed to initialize database connection pool", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Validate required environment variables
   */
  validateEnvVariables() {
    const required = ["DB_HOST", "DB_USER", "DB_PASS", "DB_DATABASE"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      const error = `FATAL: Missing required database environment variables: ${missing.join(
        ", "
      )}`;
      logger.error(error);
      throw new Error(error);
    }
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info("Database connection test successful");
    } catch (error) {
      logger.error("Database connection test failed", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Set up pool event handlers for monitoring
   */
  setupPoolEventHandlers() {
    this.pool.on("acquire", (connection) => {
      logger.debug("Connection acquired", { threadId: connection.threadId });
    });

    this.pool.on("release", (connection) => {
      logger.debug("Connection released", { threadId: connection.threadId });
    });

    this.pool.on("enqueue", () => {
      logger.warn("Waiting for available connection slot");
    });

    this.pool.on("error", (err) => {
      logger.error("Database pool error", {
        code: err.code,
        errno: err.errno,
        message: err.message,
      });
    });
  }

  /**
   * Execute a SQL query using the connection pool.
   * Includes slow query logging and timeout enforcement.
   *
   * @param {string} sql - SQL query string
   * @param {Array|Object} params - Query parameters (array or named object)
   * @param {number} timeout - Query timeout in milliseconds (default: 30s)
   * @returns {Promise<Array>} - Resulting rows from the query
   */
  async query(sql, params = [], timeout = 30000) {
    const start = Date.now();

    try {
      // Execute query with timeout
      const queryPromise = this.pool.execute(sql, params);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout exceeded")), timeout)
      );

      const [rows] = await Promise.race([queryPromise, timeoutPromise]);

      // Log slow queries
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn("Slow query detected", {
          duration,
          sql: sql.substring(0, 200), // Truncate long queries
          paramsCount: Array.isArray(params)
            ? params.length
            : Object.keys(params).length,
        });
      }

      return rows;
    } catch (error) {
      const duration = Date.now() - start;

      logger.error("Query failed", {
        duration,
        sql: sql.substring(0, 200),
        error: error.message,
        code: error.code,
        errno: error.errno,
      });

      throw error;
    }
  }

  /**
   * Begin a new database transaction (manual mode).
   * Use this for complex transactions where you need fine-grained control.
   * Remember to call commit() or rollback() and always release the connection.
   *
   * @returns {Promise<Connection>} - The database connection with transaction started
   */
  async beginTransaction() {
    try {
      const conn = await this.pool.getConnection();
      await conn.beginTransaction();

      // Track connection acquisition for debugging
      conn._acquiredAt = Date.now();

      logger.debug("Manual transaction started", {
        threadId: conn.threadId,
      });

      return conn;
    } catch (error) {
      logger.error("Failed to begin transaction", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Commit an active transaction (manual mode).
   *
   * @param {Connection} conn - The connection being used for the transaction
   */
  async commit(conn) {
    try {
      await conn.commit();

      // Log long-running transactions
      const duration = Date.now() - (conn._acquiredAt || 0);
      if (duration > 5000) {
        logger.warn("Long-running transaction detected", {
          duration,
          threadId: conn.threadId,
        });
      }

      logger.debug("Transaction committed", {
        threadId: conn.threadId,
        duration,
      });
    } catch (error) {
      logger.error("Transaction commit failed", {
        error: error.message,
        code: error.code,
      });
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Rollback an active transaction (manual mode).
   *
   * @param {Connection} conn - The connection being used for the transaction
   */
  async rollback(conn) {
    try {
      await conn.rollback();
      logger.debug("Transaction rolled back", { threadId: conn.threadId });
    } catch (error) {
      logger.error("Transaction rollback failed", {
        error: error.message,
        code: error.code,
      });
      // Don't throw - we're already in an error state
    } finally {
      conn.release();
    }
  }

  /**
   * Get a connection from the pool (for manual management).
   * Remember to always release the connection when done.
   *
   * @returns {Promise<Connection>}
   */
  async getConnection() {
    try {
      return await this.pool.getConnection();
    } catch (error) {
      logger.error("Error getting connection from pool", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Health check - verifies database connectivity.
   *
   * @returns {Promise<boolean>} - True if healthy, false otherwise
   */
  async healthCheck() {
    try {
      const result = await this.query("SELECT 1 AS health_check", [], 5000);
      return result[0]?.health_check === 1;
    } catch (error) {
      logger.error("Database health check failed", {
        error: error.message,
        code: error.code,
      });
      return false;
    }
  }

  /**
   * Get pool statistics for monitoring.
   *
   * @returns {Object} - Pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    const pool = this.pool.pool;
    return {
      totalConnections: pool._allConnections.length,
      activeConnections:
        pool._allConnections.length - pool._freeConnections.length,
      idleConnections: pool._freeConnections.length,
      queuedRequests: pool._connectionQueue.length,
    };
  }

  /**
   * Gracefully close all database connections.
   * Should be called during application shutdown.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.pool) {
      logger.warn(
        "Attempted to close database pool, but it was not initialized"
      );
      return;
    }

    try {
      logger.info("Closing database connection pool...");

      // Get stats before closing
      const stats = this.getPoolStats();
      logger.info("Final pool statistics", stats);

      await this.pool.end();

      logger.info("Database connection pool closed successfully");
    } catch (error) {
      logger.error("Error closing database pool", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }
}

export default Database;
