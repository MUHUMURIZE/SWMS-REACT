const { createHash, randomBytes } = require("node:crypto");
const { pool } = require("../config/db");
const runTransaction = require("../utils/transaction");
const auditModel = require("../models/auditModel");
const districtAuthorizationService = require("./districtAuthorizationService");
const AppError = require("../utils/AppError");

const onlineWindowSeconds = Number.isSafeInteger(Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS))
  && Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS) > 0
  ? Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS)
  : 300;

function assertManager(user) {
  if (!["ADMIN", "COMPANY_REPRESENTATIVE"].includes(user.role)) {
    throw new AppError(403, "You do not have permission to manage devices.", "FORBIDDEN");
  }
}

function credentialHash(credential) {
  return createHash("sha256").update(credential).digest("hex");
}

function newCredential() {
  const credential = randomBytes(32).toString("hex");
  return { credential, hash: credentialHash(credential) };
}

function onlineStatus(lastCommunicationAt, now = Date.now()) {
  if (!lastCommunicationAt) return "OFFLINE";
  return now - new Date(lastCommunicationAt).getTime() <= onlineWindowSeconds * 1000
    ? "ONLINE"
    : "OFFLINE";
}

function assertRecentTimestamp(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60 * 1000) {
    throw new AppError(400, "Device timestamps must be valid and no more than five minutes in the future.", "VALIDATION_ERROR");
  }
}

function assertDuplicate(existing, values, fields, timestampField) {
  const same = fields.every((field) => {
    const previous = existing[field];
    const incoming = values[field];
    if (previous == null || incoming == null) return previous == null && incoming == null;
    if (field === timestampField) {
      return new Date(previous).getTime() === new Date(incoming).getTime();
    }
    if (typeof incoming === "number") return Number(previous) === incoming;
    return previous === incoming;
  });
  if (!same) {
    throw new AppError(409, "The messageId was already used with a different payload.", "CONFLICT");
  }
}

async function companyIdFor(userId, executor = pool) {
  const result = await executor.query(
    "SELECT company_id FROM representatives WHERE user_id = $1",
    [userId]
  );
  if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
  return result.rows[0].company_id;
}

async function collectorIdFor(userId, executor = pool) {
  const result = await executor.query("SELECT id FROM collectors WHERE user_id = $1", [userId]);
  if (!result.rows[0]) throw new AppError(404, "Collector profile not found.", "NOT_FOUND");
  return result.rows[0].id;
}

async function resourceDetails(executor, type, resourceId) {
  if (type === "GPS") {
    const result = await executor.query(
      `SELECT v.id, v.company_id AS "companyId",
        v.assigned_collector_id AS "collectorId", c.district,
        TRUE AS "districtMatches"
       FROM fleet_vehicles v
       LEFT JOIN collectors c ON c.id = v.assigned_collector_id
       WHERE v.id = $1`,
      [resourceId]
    );
    if (!result.rows[0]) throw new AppError(404, "Vehicle not found.", "NOT_FOUND");
    return result.rows[0];
  }

  const result = await executor.query(
    `SELECT b.id, r.company_id AS "companyId", h.collector_id AS "collectorId",
      h.district, c.district AS "collectorDistrict",
      LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) AS "districtMatches"
     FROM waste_bins b
     JOIN households h ON h.id = b.household_id
     JOIN collectors c ON c.id = h.collector_id
     JOIN representatives r ON r.id = c.representative_id
     WHERE b.id = $1`,
    [resourceId]
  );
  if (!result.rows[0]) throw new AppError(404, "Waste bin not found.", "NOT_FOUND");
  return result.rows[0];
}

async function assertResourceAccess(user, type, resourceId, executor = pool) {
  const resource = await resourceDetails(executor, type, resourceId);
  if (user.role === "ADMIN") return resource;

  if (user.role === "COMPANY_REPRESENTATIVE") {
    const companyId = await companyIdFor(user.id, executor);
    if (resource.companyId !== companyId
      || (type === "BIN" && resource.districtMatches !== true)
      || (resource.district && !(await districtAuthorizationService.companyCanOperateInDistrict(
        resource.companyId,
        resource.district,
        executor
      )))) {
      throw new AppError(404, type === "GPS" ? "Vehicle not found." : "Waste bin not found.", "NOT_FOUND");
    }
    return resource;
  }

  if (user.role === "COLLECTOR") {
    const collectorId = await collectorIdFor(user.id, executor);
    if (resource.collectorId !== collectorId || resource.districtMatches !== true
      || !(await districtAuthorizationService.companyCanOperateInDistrict(
        resource.companyId,
        resource.district,
        executor
      ))) {
      throw new AppError(404, type === "GPS" ? "Vehicle not found." : "Waste bin not found.", "NOT_FOUND");
    }
    return resource;
  }

  throw new AppError(403, "You do not have permission to access tracking data.", "FORBIDDEN");
}

async function findDevice(executor, type, deviceId, lock = false) {
  const result = await executor.query(
    `SELECT id, device_code AS "deviceCode", device_type AS "deviceType",
      vehicle_id AS "vehicleId", bin_id AS "binId", status,
      last_communication_at AS "lastCommunicationAt", created_by AS "createdBy"
     FROM resource_devices
     WHERE id = $1 AND device_type = $2${lock ? " FOR UPDATE" : ""}`,
    [deviceId, type]
  );
  if (!result.rows[0]) throw new AppError(404, "Device not found.", "NOT_FOUND");
  return result.rows[0];
}

async function assertDeviceManagementAccess(user, type, device, executor) {
  if (user.role === "ADMIN") return;
  const resourceId = type === "GPS" ? device.vehicleId : device.binId;
  if (resourceId === null) {
    if (device.createdBy === user.id) return;
    throw new AppError(404, "Device not found.", "NOT_FOUND");
  }
  await assertResourceAccess(user, type, resourceId, executor);
}

function translateDeviceConflict(error) {
  if (error.code === "23505") {
    throw new AppError(409, "The device code, resource association, or message identifier is already in use.", "CONFLICT");
  }
  if (error.code === "23503") {
    throw new AppError(404, "The associated resource was not found.", "NOT_FOUND");
  }
  throw error;
}

exports.onlineWindowSeconds = onlineWindowSeconds;
exports.onlineStatus = onlineStatus;
exports.statusForFillLevel = (fillLevel) => {
  if (fillLevel === 0) return "EMPTY";
  if (fillLevel < 50) return "LOW";
  if (fillLevel < 80) return "MEDIUM";
  if (fillLevel < 100) return "HIGH";
  return "FULL";
};

exports.registerDevice = async (user, type, deviceCode) => {
  assertManager(user);
  const { credential, hash } = newCredential();
  try {
    return await runTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO resource_devices (device_type, device_code, credential_hash, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, device_code AS "deviceCode", device_type AS "deviceType",
           status, created_at AS "createdAt"`,
        [type, deviceCode, hash, user.id]
      );
      const device = result.rows[0];
      await auditModel.record({
        actorUserId: user.id,
        action: `${type}_DEVICE_REGISTERED`,
        resourceType: "RESOURCE_DEVICE",
        resourceId: device.id,
        metadata: { deviceType: type, deviceCode },
      }, client);
      return { ...device, credential };
    });
  } catch (error) {
    translateDeviceConflict(error);
  }
};

exports.listDevices = async (user, type, pagination) => {
  assertManager(user);
  const values = [type];
  let scope = "";
  if (user.role === "COMPANY_REPRESENTATIVE") {
    const companyId = await companyIdFor(user.id);
    values.push(companyId, user.id);
    scope = type === "GPS"
      ? `AND ((v.company_id = $2
          AND (v.assigned_collector_id IS NULL OR company_has_active_district(v.company_id, c.district)))
        OR (d.vehicle_id IS NULL AND d.created_by = $3))`
      : `AND ((r.company_id = $2
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)))
        OR (d.bin_id IS NULL AND d.created_by = $3))`;
  }
  const join = type === "GPS"
    ? `LEFT JOIN fleet_vehicles v ON v.id = d.vehicle_id
       LEFT JOIN collectors c ON c.id = v.assigned_collector_id`
    : `LEFT JOIN waste_bins b ON b.id = d.bin_id
       LEFT JOIN households h ON h.id = b.household_id
       LEFT JOIN collectors c ON c.id = h.collector_id
       LEFT JOIN representatives r ON r.id = c.representative_id`;
  values.push(pagination.limit, pagination.offset);
  const result = await pool.query(
    `SELECT d.id, d.device_code AS "deviceCode", d.device_type AS "deviceType",
      d.vehicle_id AS "vehicleId", d.bin_id AS "binId", d.status,
      d.last_communication_at AS "lastCommunicationAt",
      CASE WHEN d.status <> 'ACTIVE' THEN 'REVOKED'
        WHEN d.last_communication_at >= CURRENT_TIMESTAMP - ($${user.role === "COMPANY_REPRESENTATIVE" ? 4 : 2} * INTERVAL '1 second')
          THEN 'ONLINE' ELSE 'OFFLINE' END AS "trackingStatus"
     FROM resource_devices d ${join}
     WHERE d.device_type = $1 ${scope}
     ORDER BY d.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    [...values.slice(0, -2), onlineWindowSeconds, ...values.slice(-2)]
  );
  return result.rows;
};

exports.associateDevice = async (user, type, deviceId, resourceId) => {
  assertManager(user);
  try {
    return await runTransaction(async (client) => {
      const device = await findDevice(client, type, deviceId, true);
      await assertDeviceManagementAccess(user, type, device, client);
      if (device.status !== "ACTIVE") {
        throw new AppError(409, "Revoked devices cannot be associated with resources.", "CONFLICT");
      }
      const resource = await assertResourceAccess(user, type, resourceId, client);
      const column = type === "GPS" ? "vehicle_id" : "bin_id";
      const currentId = type === "GPS" ? device.vehicleId : device.binId;
      if (currentId !== resourceId) {
        await client.query(
          `UPDATE resource_devices SET ${column} = $1 WHERE id = $2`,
          [resourceId, deviceId]
        );
        await auditModel.record({
          actorUserId: user.id,
          action: `${type}_DEVICE_ASSOCIATED`,
          resourceType: "RESOURCE_DEVICE",
          resourceId: deviceId,
          metadata: { previousResourceId: currentId, resourceId },
        }, client);
      }
      return {
        id: device.id,
        deviceCode: device.deviceCode,
        deviceType: type,
        [type === "GPS" ? "vehicleId" : "binId"]: resource.id,
        status: device.status,
        trackingStatus: onlineStatus(device.lastCommunicationAt),
        lastCommunicationAt: device.lastCommunicationAt,
      };
    });
  } catch (error) {
    translateDeviceConflict(error);
  }
};

exports.rotateCredential = async (user, type, deviceId) => {
  assertManager(user);
  const { credential, hash } = newCredential();
  return runTransaction(async (client) => {
    const device = await findDevice(client, type, deviceId, true);
    await assertDeviceManagementAccess(user, type, device, client);
    if (device.status !== "ACTIVE") throw new AppError(409, "Revoked device credentials cannot be rotated.", "CONFLICT");
    await client.query(
      "UPDATE resource_devices SET credential_hash = $1 WHERE id = $2",
      [hash, deviceId]
    );
    await auditModel.record({
      actorUserId: user.id,
      action: `${type}_DEVICE_CREDENTIAL_ROTATED`,
      resourceType: "RESOURCE_DEVICE",
      resourceId: deviceId,
    }, client);
    return { id: deviceId, credential };
  });
};

exports.revokeDevice = async (user, type, deviceId) => {
  assertManager(user);
  await runTransaction(async (client) => {
    const device = await findDevice(client, type, deviceId, true);
    await assertDeviceManagementAccess(user, type, device, client);
    if (device.status === "REVOKED") return;
    await client.query("UPDATE resource_devices SET status = 'REVOKED' WHERE id = $1", [deviceId]);
    await auditModel.record({
      actorUserId: user.id,
      action: `${type}_DEVICE_REVOKED`,
      resourceType: "RESOURCE_DEVICE",
      resourceId: deviceId,
    }, client);
  });
};

exports.mapVehicles = async (user) => {
  const values = [onlineWindowSeconds];
  let scope = "";
  if (user.role === "COMPANY_REPRESENTATIVE") {
    values.push(await companyIdFor(user.id));
    scope = `AND v.company_id = $2
      AND (v.assigned_collector_id IS NULL OR company_has_active_district(v.company_id, c.district))`;
  } else if (user.role === "COLLECTOR") {
    values.push(await collectorIdFor(user.id));
    scope = `AND v.assigned_collector_id = $2
      AND company_has_active_district(v.company_id, c.district)`;
  } else if (user.role !== "ADMIN") {
    throw new AppError(403, "You do not have permission to view fleet tracking.", "FORBIDDEN");
  }
  const result = await pool.query(
    `SELECT v.id AS "vehicleId", v.registration_number AS "registrationNumber",
      v.company_id AS "companyId", v.assigned_collector_id AS "collectorId",
      u.full_name AS "collectorName", c.district,
      CASE WHEN d.id IS NULL THEN 'NOT_CONFIGURED'
        WHEN d.last_communication_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')
          THEN 'ONLINE' ELSE 'OFFLINE' END AS "trackingStatus",
      d.last_communication_at AS "lastCommunicationAt",
      l.device_id AS "deviceId", l.message_id AS "messageId",
      l.latitude, l.longitude, l.speed, l.heading, l.accuracy,
      l.recorded_at AS "recordedAt", l.received_at AS "receivedAt"
     FROM fleet_vehicles v
     LEFT JOIN collectors c ON c.id = v.assigned_collector_id
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN resource_devices d ON d.vehicle_id = v.id
       AND d.device_type = 'GPS' AND d.status = 'ACTIVE'
     LEFT JOIN LATERAL (
       SELECT device_id, message_id, latitude, longitude, speed, heading, accuracy, recorded_at, received_at
       FROM vehicle_locations WHERE vehicle_id = v.id
       ORDER BY recorded_at DESC, id DESC LIMIT 1
     ) l ON TRUE
     WHERE TRUE ${scope}
     ORDER BY v.id`,
    values
  );
  return result.rows.map((row) => ({
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    speed: row.speed === null ? null : Number(row.speed),
    heading: row.heading === null ? null : Number(row.heading),
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
  }));
};

async function vehicleDeviceStatus(vehicleId) {
  const result = await pool.query(
    `SELECT d.last_communication_at AS "lastCommunicationAt",
      CASE WHEN d.id IS NULL THEN 'NOT_CONFIGURED'
        WHEN d.last_communication_at >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
          THEN 'ONLINE' ELSE 'OFFLINE' END AS "trackingStatus",
      l.id AS "locationId", l.latitude, l.longitude, l.speed, l.heading, l.accuracy,
      l.recorded_at AS "recordedAt", l.received_at AS "receivedAt"
     FROM fleet_vehicles v
     LEFT JOIN resource_devices d ON d.vehicle_id = v.id
       AND d.device_type = 'GPS' AND d.status = 'ACTIVE'
     LEFT JOIN LATERAL (
       SELECT id, latitude, longitude, speed, heading, accuracy, recorded_at, received_at
       FROM vehicle_locations WHERE vehicle_id = v.id
       ORDER BY recorded_at DESC, id DESC LIMIT 1
     ) l ON TRUE
     WHERE v.id = $1`,
    [vehicleId, onlineWindowSeconds]
  );
  return result.rows[0];
}

exports.latestLocation = async (user, vehicleId) => {
  await assertResourceAccess(user, "GPS", vehicleId);
  const latest = await vehicleDeviceStatus(vehicleId);
  return {
    vehicleId,
    trackingStatus: latest.trackingStatus,
    lastCommunicationAt: latest.lastCommunicationAt,
    location: latest.locationId ? {
      latitude: Number(latest.latitude),
      longitude: Number(latest.longitude),
      speed: latest.speed === null ? null : Number(latest.speed),
      heading: latest.heading === null ? null : Number(latest.heading),
      accuracy: latest.accuracy === null ? null : Number(latest.accuracy),
      recordedAt: latest.recordedAt,
      receivedAt: latest.receivedAt,
    } : null,
  };
};

exports.locationHistory = async (user, vehicleId, pagination) => {
  await assertResourceAccess(user, "GPS", vehicleId);
  const result = await pool.query(
    `SELECT id, device_id AS "deviceId", vehicle_id AS "vehicleId",
      message_id AS "messageId", latitude, longitude, speed, heading, accuracy,
      recorded_at AS "recordedAt", received_at AS "receivedAt"
     FROM vehicle_locations WHERE vehicle_id = $1
     ORDER BY recorded_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [vehicleId, pagination.limit, pagination.offset]
  );
  return result.rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speed: row.speed === null ? null : Number(row.speed),
    heading: row.heading === null ? null : Number(row.heading),
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
  }));
};

exports.ingestLocation = async (authenticatedDevice, data) => {
  if (authenticatedDevice.deviceType !== "GPS") {
    throw new AppError(403, "This credential is not authorized for GPS ingestion.", "FORBIDDEN");
  }
  assertRecentTimestamp(data.recordedAt);
  return runTransaction(async (client) => {
    const device = await findDevice(client, "GPS", authenticatedDevice.id, true);
    if (device.status !== "ACTIVE") throw new AppError(401, "The device is revoked.", "UNAUTHENTICATED");
    if (!device.vehicleId) throw new AppError(409, "The GPS device is not associated with a vehicle.", "CONFLICT");
    const values = {
      deviceId: device.id,
      vehicleId: device.vehicleId,
      messageId: data.messageId,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed === undefined ? null : data.speed,
      heading: data.heading === undefined ? null : data.heading,
      accuracy: data.accuracy === undefined ? null : data.accuracy,
      recordedAt: data.recordedAt,
    };
    const inserted = await client.query(
      `INSERT INTO vehicle_locations
        (device_id, vehicle_id, message_id, latitude, longitude, speed, heading, accuracy, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (device_id, message_id) DO NOTHING
       RETURNING id, received_at AS "receivedAt"`,
      [values.deviceId, values.vehicleId, values.messageId, values.latitude, values.longitude,
        values.speed, values.heading, values.accuracy, values.recordedAt]
    );
    let duplicate = false;
    let duplicateReceivedAt;
    if (!inserted.rows[0]) {
      const existing = await client.query(
        `SELECT vehicle_id AS "vehicleId", latitude, longitude, speed, heading, accuracy,
          recorded_at AS "recordedAt", received_at AS "receivedAt"
         FROM vehicle_locations WHERE device_id = $1 AND message_id = $2`,
        [device.id, data.messageId]
      );
      assertDuplicate(existing.rows[0], values,
        ["vehicleId", "latitude", "longitude", "speed", "heading", "accuracy", "recordedAt"], "recordedAt");
      duplicate = true;
      duplicateReceivedAt = existing.rows[0].receivedAt;
    }
    await client.query(
      "UPDATE resource_devices SET last_communication_at = CURRENT_TIMESTAMP WHERE id = $1",
      [device.id]
    );
    return {
      deviceId: device.id,
      vehicleId: device.vehicleId,
      messageId: data.messageId,
      receivedAt: inserted.rows[0]?.receivedAt || duplicateReceivedAt || null,
      duplicate,
    };
  });
};

async function binTelemetryState(binId) {
  const result = await pool.query(
    `SELECT d.last_communication_at AS "lastCommunicationAt",
      CASE WHEN d.id IS NULL THEN 'NOT_CONFIGURED'
        WHEN d.last_communication_at >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
          THEN 'ONLINE' ELSE 'OFFLINE' END AS "deviceStatus",
      r.fill_level AS "fillLevel", r.battery_level AS "batteryLevel",
      r.sensor_status AS "sensorStatus", r.overflow_detected AS "overflowDetected",
      r.measured_at AS "measuredAt", r.received_at AS "receivedAt"
     FROM waste_bins b
     LEFT JOIN resource_devices d ON d.bin_id = b.id
       AND d.device_type = 'BIN' AND d.status = 'ACTIVE'
     LEFT JOIN LATERAL (
       SELECT fill_level, battery_level, sensor_status, overflow_detected, measured_at, received_at
       FROM bin_sensor_readings WHERE bin_id = b.id
       ORDER BY measured_at DESC, id DESC LIMIT 1
     ) r ON TRUE
     WHERE b.id = $1`,
    [binId, onlineWindowSeconds]
  );
  return result.rows[0];
}

exports.latestBinReading = async (user, binId) => {
  await assertResourceAccess(user, "BIN", binId);
  const latest = await binTelemetryState(binId);
  return {
    binId,
    deviceStatus: latest.deviceStatus,
    lastCommunicationAt: latest.lastCommunicationAt,
    reading: latest.measuredAt ? {
      fillLevel: Number(latest.fillLevel),
      batteryLevel: latest.batteryLevel,
      sensorStatus: latest.sensorStatus,
      overflowDetected: latest.overflowDetected,
      measuredAt: latest.measuredAt,
      receivedAt: latest.receivedAt,
    } : null,
  };
};

exports.binReadingHistory = async (user, binId, pagination) => {
  await assertResourceAccess(user, "BIN", binId);
  const result = await pool.query(
    `SELECT id, device_id AS "deviceId", bin_id AS "binId", message_id AS "messageId",
      fill_level AS "fillLevel", battery_level AS "batteryLevel", sensor_status AS "sensorStatus",
      overflow_detected AS "overflowDetected", measured_at AS "measuredAt",
      received_at AS "receivedAt"
     FROM bin_sensor_readings WHERE bin_id = $1
     ORDER BY measured_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [binId, pagination.limit, pagination.offset]
  );
  return result.rows.map((row) => ({ ...row, fillLevel: Number(row.fillLevel) }));
};

exports.ingestTelemetry = async (authenticatedDevice, data) => {
  if (authenticatedDevice.deviceType !== "BIN") {
    throw new AppError(403, "This credential is not authorized for bin telemetry.", "FORBIDDEN");
  }
  assertRecentTimestamp(data.measuredAt);
  return runTransaction(async (client) => {
    const device = await findDevice(client, "BIN", authenticatedDevice.id, true);
    if (device.status !== "ACTIVE") throw new AppError(401, "The device is revoked.", "UNAUTHENTICATED");
    if (!device.binId) throw new AppError(409, "The bin sensor is not associated with a bin.", "CONFLICT");
    const values = {
      deviceId: device.id,
      binId: device.binId,
      messageId: data.messageId,
      fillLevel: data.fillLevel,
      batteryLevel: data.batteryLevel === undefined ? null : data.batteryLevel,
      sensorStatus: data.sensorStatus,
      overflowDetected: data.overflowDetected === undefined ? null : data.overflowDetected,
      measuredAt: data.measuredAt,
    };
    const previousLatest = await client.query(
      `SELECT measured_at AS "measuredAt" FROM bin_sensor_readings
       WHERE bin_id = $1 ORDER BY measured_at DESC, id DESC LIMIT 1`,
      [device.binId]
    );
    const inserted = await client.query(
      `INSERT INTO bin_sensor_readings
        (device_id, bin_id, message_id, fill_level, battery_level, sensor_status, overflow_detected, measured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (device_id, message_id) DO NOTHING
       RETURNING id, received_at AS "receivedAt"`,
      [values.deviceId, values.binId, values.messageId, values.fillLevel, values.batteryLevel,
        values.sensorStatus, values.overflowDetected, values.measuredAt]
    );
    let duplicate = false;
    let duplicateReceivedAt;
    if (!inserted.rows[0]) {
      const existing = await client.query(
        `SELECT bin_id AS "binId", fill_level AS "fillLevel", battery_level AS "batteryLevel",
          sensor_status AS "sensorStatus", overflow_detected AS "overflowDetected",
          measured_at AS "measuredAt", received_at AS "receivedAt"
         FROM bin_sensor_readings WHERE device_id = $1 AND message_id = $2`,
        [device.id, data.messageId]
      );
      assertDuplicate(existing.rows[0], values,
        ["binId", "fillLevel", "batteryLevel", "sensorStatus", "overflowDetected", "measuredAt"], "measuredAt");
      duplicate = true;
      duplicateReceivedAt = existing.rows[0].receivedAt;
    } else {
      const isLatest = !previousLatest.rows[0]
        || new Date(data.measuredAt).getTime() >= new Date(previousLatest.rows[0].measuredAt).getTime();
      if (isLatest) {
        await client.query(
          "UPDATE waste_bins SET fill_level = $1, status = $2 WHERE id = $3",
          [data.fillLevel, exports.statusForFillLevel(data.fillLevel), device.binId]
        );
      }
    }
    await client.query(
      "UPDATE resource_devices SET last_communication_at = CURRENT_TIMESTAMP WHERE id = $1",
      [device.id]
    );
    return {
      deviceId: device.id,
      binId: device.binId,
      messageId: data.messageId,
      receivedAt: inserted.rows[0]?.receivedAt || duplicateReceivedAt || null,
      duplicate,
    };
  });
};

exports.listBinAlerts = async (user, pagination) => {
  const values = [onlineWindowSeconds];
  let scope = "";
  if (user.role === "COMPANY_REPRESENTATIVE") {
    values.push(await companyIdFor(user.id));
    scope = `AND co.id = $2 AND company_has_active_district(co.id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
  } else if (user.role === "COLLECTOR") {
    values.push(await collectorIdFor(user.id));
    scope = `AND h.collector_id = $2 AND company_has_active_district(co.id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
  } else if (user.role !== "ADMIN") {
    throw new AppError(403, "You do not have permission to view bin alerts.", "FORBIDDEN");
  }
  values.push(pagination.limit, pagination.offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;
  const result = await pool.query(
    `SELECT b.id AS "binId", b.bin_code AS "binCode", h.district,
      alert.alert_type AS "alertType", d.last_communication_at AS "lastCommunicationAt",
      reading.measured_at AS "measuredAt", reading.fill_level AS "fillLevel"
     FROM waste_bins b
     JOIN households h ON h.id = b.household_id
     JOIN collectors c ON c.id = h.collector_id
     JOIN representatives rep ON rep.id = c.representative_id
     JOIN companies co ON co.id = rep.company_id
     JOIN resource_devices d ON d.bin_id = b.id AND d.device_type = 'BIN' AND d.status = 'ACTIVE'
     LEFT JOIN LATERAL (
       SELECT fill_level, sensor_status, overflow_detected, measured_at
       FROM bin_sensor_readings WHERE bin_id = b.id
       ORDER BY measured_at DESC, id DESC LIMIT 1
     ) reading ON TRUE
     CROSS JOIN LATERAL (
       SELECT 'OVERFLOW'::text AS alert_type
       WHERE reading.overflow_detected IS TRUE
       UNION ALL
       SELECT 'FULL'::text WHERE reading.fill_level = 100
       UNION ALL
       SELECT 'SENSOR_FAULT'::text WHERE reading.sensor_status = 'FAULT'
       UNION ALL
       SELECT 'DEVICE_OFFLINE'::text
       WHERE d.last_communication_at IS NULL
         OR d.last_communication_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')
     ) alert
     WHERE TRUE ${scope}
     ORDER BY d.last_communication_at ASC NULLS FIRST, b.id, alert.alert_type
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values
  );
  return result.rows;
};
