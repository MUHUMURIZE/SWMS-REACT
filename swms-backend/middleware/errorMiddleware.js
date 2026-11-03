function notFound(_req, _res, next) {
  const error = new Error("The requested endpoint was not found.");
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  next(error);
}

function errorHandler(error, _req, res, _next) {
  if (error.code === "23505") {
    return res.status(409).json({
      error: { code: "CONFLICT", message: "A record with that unique value already exists." },
    });
  }

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  if (statusCode >= 500) console.error(error);
  const response = {
    error: {
      code: error.code || (statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR"),
      message: statusCode === 500 ? "An unexpected server error occurred." : error.message,
    },
  };
  if (error.details) response.error.details = error.details;
  res.status(statusCode).json(response);
}

exports.notFound = notFound;
exports.errorHandler = errorHandler;
