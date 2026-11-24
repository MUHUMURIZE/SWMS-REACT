const AppError = require("../utils/AppError");

function validateBody(schema) {
  return (req, _res, next) => {
    const body = req.body;
    const errors = [];

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return next(new AppError(400, "Request body must be a JSON object.", "VALIDATION_ERROR"));
    }
    if (Object.keys(body).length === 0) errors.push("Request body must not be empty.");

    for (const [field, rule] of Object.entries(schema)) {
      let value = body[field];
      if (typeof value === "string" && rule.type !== "password") {
        value = value.trim();
        body[field] = value;
      }
      if (value === undefined || value === null || value === "") {
        if (rule.required) errors.push(`${field} is required.`);
        continue;
      }
      if (rule.type === "string" && typeof value !== "string") {
        errors.push(`${field} must be a string.`);
        continue;
      }
      if (rule.type === "number" && (typeof value !== "number" || !Number.isSafeInteger(value)
        || value < (rule.min === undefined ? 1 : rule.min)
        || value > (rule.max === undefined ? Number.MAX_SAFE_INTEGER : rule.max))) {
        errors.push(rule.min === 0
          ? `${field} must be an integer between ${rule.min} and ${rule.max}.`
          : `${field} must be a positive integer.`);
        continue;
      }
      if (rule.type === "email" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
        errors.push(`${field} must be a valid email address.`);
        continue;
      }
      if (rule.type === "password" && (typeof value !== "string" || value.length < 8)) {
        errors.push(`${field} must be at least 8 characters long.`);
        continue;
      }
      if (rule.type === "strongPassword" && typeof value !== "string") {
        errors.push(`${field} must be a string.`);
        continue;
      }
      if (rule.type === "strongPassword") {
        const strongPassword =
          value.length >= 12
          && value.length <= 128
          && /[a-z]/.test(value)
          && /[A-Z]/.test(value)
          && /\d/.test(value)
          && /[^A-Za-z0-9]/.test(value);
        if (!strongPassword) {
          errors.push(`${field} must be 12-128 characters and include uppercase, lowercase, number, and symbol.`);
        }
      }
      if (rule.type === "enum" && !rule.values.includes(value)) {
        errors.push(`${field} must be one of: ${rule.values.join(", ")}.`);
        continue;
      }
      if (rule.type === "datetime" && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) {
        errors.push(`${field} must be a valid date and time.`);
        continue;
      }
      if (rule.type === "datetime") {
        req.body[field] = new Date(value).toISOString();
      }
      if (typeof value === "string" && rule.minLength && value.trim().length < rule.minLength) {
        errors.push(`${field} must contain at least ${rule.minLength} characters.`);
      }
      if (typeof value === "string" && rule.maxLength && value.length > rule.maxLength) {
        errors.push(`${field} must not exceed ${rule.maxLength} characters.`);
      }
    }

    const unknownFields = Object.keys(body).filter((field) => !Object.hasOwn(schema, field));
    if (unknownFields.length) errors.push(`Unknown fields: ${unknownFields.join(", ")}.`);
    if (errors.length) {
      return next(new AppError(400, "Request validation failed.", "VALIDATION_ERROR", errors));
    }
    next();
  };
}

function validateId(req, _res, next) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return next(new AppError(400, "The resource id must be a positive integer.", "VALIDATION_ERROR"));
  }
  req.params.id = id;
  next();
}

function requireRoleFields(fieldsByRole) {
  return (req, _res, next) => {
    const required = fieldsByRole[req.user?.role] || [];
    const missing = required.filter((field) => req.body[field] === undefined || req.body[field] === null || req.body[field] === "");
    if (missing.length) {
      return next(new AppError(400, "Request validation failed.", "VALIDATION_ERROR",
        missing.map((field) => `${field} is required for this role.`)));
    }
    next();
  };
}

exports.validateBody = validateBody;
exports.validateId = validateId;
exports.requireRoleFields = requireRoleFields;
