const AppError = require("../utils/AppError");

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function assertDevelopmentRuntime(context = "Simulator") {
  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      403,
      `${context} is strictly disabled in production environments.`,
      "SIMULATOR_DISABLED_IN_PRODUCTION"
    );
  }
}

function assertLoopbackApiUrl(rawUrl) {
  assertDevelopmentRuntime("Simulator API target");
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(400, `Invalid simulator API URL: ${rawUrl}`, "VALIDATION_ERROR");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "Simulator API URL must use http or https.", "VALIDATION_ERROR");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new AppError(
      403,
      `Simulator can only target loopback development hosts (localhost / 127.0.0.1 / ::1), got "${parsed.hostname}".`,
      "SIMULATOR_REMOTE_TARGET_BLOCKED"
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

function assertLoopbackDatabase() {
  assertDevelopmentRuntime("Simulator database setup");
  const host = (process.env.DB_HOST || "localhost").trim().toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new AppError(
      403,
      `Simulation fixture setup refuses non-loopback DB_HOST "${host}".`,
      "SIMULATOR_REMOTE_TARGET_BLOCKED"
    );
  }
}

function assertSimulatedDeviceRecord(device) {
  assertDevelopmentRuntime("Simulated device check");
  const resourceId = device?.vehicleId ?? device?.binId;
  if (!device
    || device.isSimulated !== true
    || !String(device.deviceCode || "").startsWith("SIM-")
    || !/^[a-f0-9]{64}$/i.test(device.credential || "")
    || !Number.isSafeInteger(resourceId)
    || resourceId < 1) {
    throw new AppError(
      403,
      "Simulator requires a simulated SIM-* device, valid device credential, and associated resource.",
      "SIMULATOR_DEVICE_SAFETY_BLOCK"
    );
  }
}

module.exports = {
  LOOPBACK_HOSTS,
  assertDevelopmentRuntime,
  assertLoopbackApiUrl,
  assertLoopbackDatabase,
  assertSimulatedDeviceRecord,
};
