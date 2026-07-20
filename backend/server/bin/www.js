 /**
 * Module dependencies.
 * !! HIGH P6: Single-Threaded : No cluster mode or worker threads for CPU utilization
 */
import debugLib from "debug";
import fs from "fs";
import http from "http";
import https from "https";
import os from "os";
import path from "path";
import app, { db } from "../config/express.js";
import { logger } from "../config/logger.js";
import {
  close as closeRateLimiter,
  getStats as getRateLimiterStats,
} from "../src/utils/rateLimiterService.js";

const debug = debugLib("wb:server");

/**
 * Startup health checks - verify critical dependencies before accepting traffic
 */
async function startupHealthChecks() {
  logger.info("Running startup health checks...");

  const checks = [];

  // 1. Database connectivity check
  checks.push({
    name: "Database",
    check: async () => {
      // Initialize database connection pool first
      await db.initialize();

      // Then verify connectivity
      const isHealthy = await db.healthCheck();
      if (!isHealthy) {
        throw new Error("Database health check failed");
      }
      logger.info("✓ Database connectivity verified");
    },
  });

  // 2. JWT keys check
  checks.push({
    name: "JWT Keys",
    check: async () => {
      const privateKeyPath = path.resolve(`${process.env.jwtAuthPrivatePath}`);
      const publicKeyPath = path.resolve(`${process.env.jwtAuthPublicPath}`);

      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`JWT private key not found at ${privateKeyPath}`);
      }
      if (!fs.existsSync(publicKeyPath)) {
        throw new Error(`JWT public key not found at ${publicKeyPath}`);
      }

      logger.info("✓ JWT keys verified");
    },
  });

  // 3. Required directories check
  checks.push({
    name: "Required Directories",
    check: async () => {
      const dirs = ["./logs", "./public", "./public/uploads"];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          logger.info(`Created directory: ${dir}`);
        }
      }

      logger.info("✓ Required directories verified");
    },
  });

  // Execute all checks
  for (const { name, check } of checks) {
    try {
      await check();
    } catch (error) {
      logger.error(`FATAL: ${name} check failed`, {
        error: error.message,
        stack: error.stack,
      });
      console.error(`\n❌ STARTUP FAILED: ${name} check failed`);
      console.error(`   ${error.message}\n`);
      process.exit(1);
    }
  }

  logger.info("All startup health checks passed ✓");
}

// Email worker - only import if Redis is configured
// let emailWorker = null;
// try {
//   if (process.env.REDIS_HOST || process.env.ENABLE_EMAIL_WORKER === "true") {
//     const emailWorkerModule = await import("../src/workers/email.worker.js");
//     emailWorker = emailWorkerModule.emailWorker;
//     logger.info("Email worker initialized successfully");
//   } else {
//     logger.info("Email worker disabled - Redis not configured");
//   }
// } catch (error) {
//   logger.warn("Failed to initialize email worker:", error.message);
//   logger.warn("Continuing without email worker - emails will not be processed");
// }

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || 3000);
app.set("port", port);
/**
 * Create HTTP server.
 */

let server;

/**
 * Create HTTPS server.
 */
if (process.env.certPath) {
  const privateKeys = fs.readFileSync(path.resolve(`${process.env.certPath}/privkey.pem`), "utf8");
  const cert = fs.readFileSync(path.resolve(`${process.env.certPath}/cert.pem`), "utf8");
  const ca = fs.readFileSync(path.resolve(`${process.env.certPath}/chain.pem`), "utf8");
  server = https.createServer({ key: privateKeys, cert: cert, ca: ca }, app);
} else {
  server = http.createServer(app);
}

/**
 * Configure server security and resilience settings
 */
// Set timeout for incoming requests (2 minutes)
server.timeout = 120000; // 120 seconds

// Set keep-alive timeout (slightly higher than timeout)
server.keepAliveTimeout = 125000; // 125 seconds

// Set headers timeout (must be higher than keepAliveTimeout)
server.headersTimeout = 130000; // 130 seconds

// Set max connections limit to prevent resource exhaustion
server.maxConnections = 1000;

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  logger.info(`${signal} signal received: initiating graceful shutdown`);

  // Stop accepting new connections
  server.close(() => {
    logger.info("HTTP server closed - no longer accepting connections");
  });

  try {
    // Give in-flight requests time to complete (max 30 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.warn("Shutdown timeout exceeded - forcing exit");
      process.exit(1);
    }, 30000);

    // Close resources in order
    const shutdownTasks = [];

    // 1. Close email worker
    if (emailWorker) {
      shutdownTasks.push(
        emailWorker
          .close()
          .then(() => logger.info("✓ Email worker closed"))
          .catch((err) => logger.error("Email worker close error", err))
      );
    }

    // 2. Close database connections
    shutdownTasks.push(
      db
        .close()
        .then(() => logger.info("✓ Database connections closed"))
        .catch((err) => logger.error("Database close error", err))
    );

    // 3. Close rate limiter connections (Redis/MySQL if used)
    shutdownTasks.push(
      closeRateLimiter()
        .then(() => logger.info("✓ Rate limiter connections closed"))
        .catch((err) => logger.error("Rate limiter close error", err))
    );

    await Promise.all(shutdownTasks);

    clearTimeout(shutdownTimeout);
    logger.info("Graceful shutdown completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

process.once("uncaughtException", (error) => {
  console.error("FATAL: Uncaught Exception:", error);
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.once("unhandledRejection", (reason, promise) => {
  console.error("FATAL: Unhandled Promise Rejection:", reason);
  logger.error("Unhandled Rejection", { reason, promise });
  process.exit(1);
});
/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? `Pipe ${port}` : `Port ${port}`;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
    case "EADDRINUSE":
      console.error(`${bind} is already in use`);
      process.exit(1);
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  const addr = server.address();
  const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr.port}`;
  debug(`Listening on ${bind}`);

  let address;
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];

    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal)
        address = alias.address;
    }
  }

  console.log("\x1b[33m");
  console.log("---------------------------");
  console.log("✓ SERVER READY");
  console.log(`Address: ${address || "localhost"}`);
  console.log(`Port: ${addr.port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("---------------------------");
  console.log("\x1b[0m");

  // Log pool statistics periodically (every 5 minutes)
  // setInterval(() => {
  //   const dbStats = db.getPoolStats();
  //   const rateLimiterStats = getRateLimiterStats();
  //   logger.info('Pool statistics', {
  //     database: dbStats,
  //     rateLimiter: rateLimiterStats
  //   });
  // }, 5 * 60 * 1000);
}

/**
 * Start the server after passing all health checks
 */
(async () => {
  try {
    // Run startup health checks first
    await startupHealthChecks();

    // Database is already initialized and attached to req.db in express.js
    // No need for app.locals.db

    // Start listening only after health checks pass
    server.listen(port);
    server.on("error", onError);
    server.on("listening", onListening);
  } catch (error) {
    logger.error("Server startup failed", {
      error: error.message,
      stack: error.stack,
    });
    console.error("\n❌ SERVER STARTUP FAILED\n");
    process.exit(1);
  }
})();
