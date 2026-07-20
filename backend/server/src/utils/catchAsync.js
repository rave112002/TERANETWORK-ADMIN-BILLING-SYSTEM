import { z } from "zod";

// Validate request body
// Note: Declared as async for middleware consistency and future-proofing
// even though schema.parse() is currently synchronous
export const validateBody = (schema) => {
  // eslint-disable-next-line require-await
  return async (req, res, next) => {
    try {
      // Log incoming body for debugging
      if (process.env.NODE_ENV === "development") {
        console.log(
          "validateBody - Request body:",
          JSON.stringify(req.body, null, 2)
        );
      }

      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      // Log validation error details
      console.error("validateBody - Validation error:", {
        errorType: error.constructor.name,
        isZodError: error instanceof z.ZodError,
        errorMessage: error.message,
        hasErrors: error.errors !== undefined,
        errorsIsArray: Array.isArray(error.errors),
      });

      if (error instanceof z.ZodError) {
        // Zod v3+ uses 'issues' property, but some versions use 'errors'
        // Try both to ensure compatibility
        const errorList = error.issues || error.errors || [];

        console.log("DEBUG - Using error list:", {
          hasIssues: !!error.issues,
          hasErrors: !!error.errors,
          issuesLength: error.issues?.length,
          errorsLength: error.errors?.length,
          usingProperty: error.issues ? "issues" : "errors",
        });

        try {
          return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errorList.map((err) => ({
              field: err.path.join("."),
              message: err.message,
            })),
          });
        } catch (mapError) {
          // If .map() fails, log the error and return the raw errors
          console.error("Failed to map ZodError:", {
            mapError: mapError.message,
            issues: error.issues,
            errors: error.errors,
            errorList: errorList,
          });

          // Return raw errors as fallback
          return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errorList,
          });
        }
      }
      next(error);
    }
  };
};

// Validate query parameters
// Note: req.query is read-only in Express, so we store parsed data in req.validatedQuery
// and also copy validated values back to req.query properties individually
export const validateQuery = (schema) => {
  // eslint-disable-next-line require-await
  return async (req, res, next) => {
    try {
      const parsed = schema.parse(req.query);
      // Store validated data in a separate property
      req.validatedQuery = parsed;
      // Also update individual query properties (since req.query object itself is read-only)
      Object.keys(parsed).forEach((key) => {
        req.query[key] = parsed[key];
      });
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorList = error.issues || error.errors || [];
        return res.status(400).json({
          success: false,
          message: "Invalid query parameters",
          errors: errorList.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

// Validate route parameters
// Note: Declared as async for middleware consistency and future-proofing
export const validateParams = (schema) => {
  // eslint-disable-next-line require-await
  return async (req, res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Extra safety check - ensure errors array exists
        if (!Array.isArray(error.errors)) {
          console.error("ZodError.errors is not an array:", error);
          return res.status(400).json({
            success: false,
            message: "Invalid parameters",
            errors: [],
          });
        }

        return res.status(400).json({
          success: false,
          message: "Invalid parameters",
          errors: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

// Async error wrapper
export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
