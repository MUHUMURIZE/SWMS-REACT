const { createHash } = require("node:crypto");
const { pool } = require("../config/db");
const AppError = require("../utils/AppError");

async function authenticateDevice(req, _res, next) {
  try {
    if (process.env.NODE_ENV === "production" && !req.secure) {
      throw new AppError(426, "Device ingestion requires HTTPS.", "HTTPS_REQUIRED");
    }
    const credential = req.get("x-device-credential");
    if (typeof credential !== "string" || !/^[a-f0-9]{64}$/i.test(credential)) {
      throw new AppError(401, "A valid device credential is required.", "UNAUTHENTICATED");
    }

    const credentialHash = createHash("sha256").update(credential).digest("hex");
    const result = await pool.query(
      `SELECT id, device_type AS "deviceType"
       FROM resource_devices
       WHERE credential_hash = $1 AND status = 'ACTIVE'`,
      [credentialHash]
    );
    if (!result.rows[0]) {
      throw new AppError(401, "The device credential is invalid or revoked.", "UNAUTHENTICATED");
    }
    req.device = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticateDevice };
