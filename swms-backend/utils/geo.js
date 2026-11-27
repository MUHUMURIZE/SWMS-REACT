const AppError = require("./AppError");

function validateGeoInput(data = {}) {
  const hasLat = data.latitude !== undefined && data.latitude !== null;
  const hasLng = data.longitude !== undefined && data.longitude !== null;
  if (hasLat !== hasLng) {
    throw new AppError(
      400,
      "Both latitude and longitude must be provided together.",
      "VALIDATION_ERROR"
    );
  }
  const hasMeta = data.locationAccuracy !== undefined || data.locationCapturedAt !== undefined;
  if (hasMeta && !hasLat) {
    throw new AppError(
      400,
      "Latitude and longitude are required when recording location accuracy or capture timestamp.",
      "VALIDATION_ERROR"
    );
  }
  if (!hasLat) return null;
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    locationAccuracy: data.locationAccuracy === undefined ? null : data.locationAccuracy,
    locationCapturedAt: data.locationCapturedAt || new Date().toISOString(),
  };
}

function normalizeGeoFields(row) {
  if (!row) return row;
  const next = { ...row };
  if (Object.hasOwn(next, "latitude")) {
    next.latitude = next.latitude === null ? null : Number(next.latitude);
  }
  if (Object.hasOwn(next, "longitude")) {
    next.longitude = next.longitude === null ? null : Number(next.longitude);
  }
  if (Object.hasOwn(next, "locationAccuracy")) {
    next.locationAccuracy = next.locationAccuracy === null ? null : Number(next.locationAccuracy);
  }
  return next;
}

module.exports = {
  validateGeoInput,
  normalizeGeoFields,
};
