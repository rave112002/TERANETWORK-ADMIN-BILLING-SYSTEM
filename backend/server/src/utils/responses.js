// Success response handler
export const success = (res, message, data, statusCode) => {
  // Sends a JSON response indicating a successful operation
  return res.status(statusCode).json({
    success: true, // Indicates the operation was successful
    message, // A message describing the success (default: 'Success')
    data, // The data to be sent in the response (default: empty object)
  });
};

// Error response handler
export const error = (res, message, error, statusCode, code = 'INTERNAL_ERROR') => {
  // Sends a JSON response indicating an error occurred
  return res.status(statusCode).json({
    success: false, // Indicates the operation failed
    message, // A message describing the error (default: 'Something went wrong')
    code, // Machine-readable error code
    error, // The error details (default: empty object)
  });
};
