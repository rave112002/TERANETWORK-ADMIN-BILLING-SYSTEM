import { error, success } from "../utils/responses.js"; // Importing success and error response utilities

// Middleware function to wrap response methods for success and error responses
export const responseWrapper = (req, res, next) => {
  // Adds a sendSuccess method to the response object for handling successful responses
  // It uses the 'success' utility function to send a response with the message, data, and status code

  res.sendSuccess = (message, data, statusCode) => {
    if (typeof data === "number") {
      // If data is a number, treat it as a status code and send success with null data
      return success(res, message, null, data);
    }
    // Otherwise, send success with the provided message, data, and status code
    return success(res, message, data || null, statusCode || 200);
  };

  // Adds a sendError method to the response object for handling error responses
  // It uses the 'error' utility function to send a response with the error message, error details, and status code
  res.sendError = (message, err, statusCode) => {
    // If err is not provided, default to an empty object
    if (typeof err === "number") {
      return error(res, message, null, err); // If err is a number, treat it as a status code
    }
    // If err is not provided, send a generic error response
    // with the provided message and default status code
    return error(res, message, err || null, statusCode || 400);
  };

  // Calls next middleware in the stack
  next();
};
