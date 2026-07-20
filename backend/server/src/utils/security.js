// security.js
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import sanitizeHtml from "sanitize-html";

// =========================
// 1) Sanitization middleware
// =========================
const allowHtmlFields = new Set(["description", "content"]); // example

// Configure sanitization rules
const defaultSanitizeOpts = { allowedTags: [], allowedAttributes: {} }; // plain text
const richSanitizeOpts = {
  allowedTags: ["b", "i", "em", "strong", "a", "ul", "ol", "li", "p", "br"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

// Sanitize a single value
function sanitizeValue(value, mode = "plain") {
  if (typeof value !== "string") return value;

  // Remove zero-width/invisible chars
  const newValue = value.replaceAll(/[\u200B-\u200D\uFEFF]/g, "");

  // Apply sanitization based on mode
  const opts = mode === "rich" ? richSanitizeOpts : defaultSanitizeOpts;
  let clean = sanitizeHtml(newValue, opts);

  // Normalize CRLF and collapse spaces
  clean = clean
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll(/\s+/g, " "))
    .join("\n");

  // Convert empty string to null
  return clean.length === 0 ? null : clean;
}

// Recursively sanitize an object/array
function purifyReqBody(obj, fieldModes = {}) {
  if (Array.isArray(obj)) {
    return obj.map((v) => purifyReqBody(v, fieldModes));
  }

  if (obj && typeof obj === "object") {
    for (const key in obj) {
      const mode =
        fieldModes[key] || (allowHtmlFields.has(key) ? "rich" : "plain");

      if (typeof obj[key] === "string") {
        obj[key] = sanitizeValue(obj[key], mode);
      } else if (obj[key] && typeof obj[key] === "object") {
        obj[key] = purifyReqBody(obj[key], fieldModes);
      }
    }
    return obj;
  }

  return obj;
}

// =========================
// 2) Helmet + CORS for API
// =========================
export function securityHeaders(options = {}) {
  const {
    isDevelopment = process.env.NODE_ENV === "development",
    allowedOrigins = [process.env.FRONTEND_URL || "http://localhost:3000"],
    enableCSP = false,
  } = options;
  return [
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin" },

      xContentTypeOptions: true, // X-Content-Type-Options: nosniff
      frameguard: { action: "deny" }, // X-Frame-Options: DENY

      // HTTP Strict Transport Security (HSTS)
      hsts: isDevelopment
        ? false
        : {
            maxAge: 63072000, // 2 years in seconds
            includeSubDomains: true,
            preload: true,
          },

      // Expect-CT header (deprecated but still useful for older browsers)
      expectCt: isDevelopment ? false : { maxAge: 86400, enforce: true },

      // Referrer Policy - control referrer information
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },

      // DNS Prefetch Control - prevent DNS prefetching
      dnsPrefetchControl: { allow: false },

      // Permitted Cross-Domain Policies (for Adobe products)
      permittedCrossDomainPolicies: { permittedPolicies: "none" },

      // X-Download-Options for IE8+
      ieNoOpen: true,

      // Hide X-Powered-By header (already set in express, but helmet ensures it)
      hidePoweredBy: true,

      // Content Security Policy
      contentSecurityPolicy: enableCSP
        ? {
            directives: {
              defaultSrc: ["'self'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              manifestSrc: ["'self'"],
              objectSrc: ["'none'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline for inline styles if needed
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              mediaSrc: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    }),

    // Custom Permissions-Policy header (replaces Feature-Policy)
    (req, res, next) => {
      res.setHeader(
        "Permissions-Policy",
        [
          "geolocation=()",
          "microphone=()",
          "camera=()",
          "payment=()",
          "usb=()",
          "magnetometer=()",
          "gyroscope=()",
          "accelerometer=()",
          "ambient-light-sensor=()",
          "autoplay=()",
          "encrypted-media=()",
          "fullscreen=(self)",
          "picture-in-picture=()",
        ].join(", ")
      );
      next();
    },
    cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          if (isDevelopment) {
            return callback(null, true);
          } else {
            return callback(new Error("Not allowed by CORS policy"), false);
          }
        }
<<<<<<< HEAD

        if (isDevelopment) {
          // Allow localhost in development
          if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
            return callback(null, true);
          }
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS policy"));
        }
=======
        if (isDevelopment && origin.startsWith("chrome-extension://")) {
          // Allow Chrome extensions in development
          return callback(null, true);
        }

        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS policy"));
>>>>>>> 20dadd5 (reorder files and move to utils folder)
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Cache-Control",
<<<<<<< HEAD
=======
        "X-CSRF-Token",
>>>>>>> 20dadd5 (reorder files and move to utils folder)
      ],
      exposedHeaders: [
        "Content-Range",
        "X-Total-Count",
        "X-Rate-Limit-Remaining",
        "X-Rate-Limit-Reset",
      ],
      maxAge: 86400, // Cache preflight for 24 hours
    }),
    hpp(),
  ];
}

// =========================
// 3) Sanitization middleware export
// =========================
export const sanitizeMiddleware = (req, res, next) => {
  if (req.body) {
    req.body = purifyReqBody(req.body);
  }
  next();
};
