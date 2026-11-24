const AppError = require("../utils/AppError");

function validatePagination(req, _res, next) {
  const limitRaw = req.query.limit === undefined ? "50" : req.query.limit;
  const offsetRaw = req.query.offset === undefined ? "0" : req.query.offset;
  const limit = Number(limitRaw);
  const offset = Number(offsetRaw);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    return next(new AppError(400, "limit must be an integer between 1 and 200.", "VALIDATION_ERROR"));
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return next(new AppError(400, "offset must be a non-negative integer.", "VALIDATION_ERROR"));
  }

  req.pagination = { limit, offset };
  next();
}

module.exports = validatePagination;
