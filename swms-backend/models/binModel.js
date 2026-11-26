const { pool } = require("../config/db");
const onlineWindowSeconds = Number.isSafeInteger(Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS))
  && Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS) > 0
  ? Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS)
  : 300;

const selection = `SELECT b.id, b.household_id AS "householdId", b.bin_code AS "binCode",
  b.capacity, b.fill_level AS "fillLevel", b.status,
  b.created_at AS "createdAt", b.updated_at AS "updatedAt",
  u.full_name AS "householdName", h.collector_id AS "collectorId",
  r.company_id AS "companyId", h.district,
  CASE WHEN sensor_device.id IS NULL THEN 'NOT_CONFIGURED'
    WHEN sensor_device.last_communication_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')
      THEN 'ONLINE' ELSE 'OFFLINE' END AS "sensorDeviceStatus",
  sensor_device.last_communication_at AS "lastCommunicationAt",
  sensor.fill_level::integer AS "sensorFillLevel", sensor.battery_level AS "batteryLevel",
  sensor.sensor_status AS "sensorStatus", sensor.overflow_detected AS "overflowDetected",
  sensor.measured_at AS "sensorMeasuredAt"
  FROM waste_bins b
  JOIN households h ON h.id = b.household_id
  JOIN users u ON u.id = h.user_id
  JOIN collectors c ON c.id = h.collector_id
  JOIN representatives r ON r.id = c.representative_id
  LEFT JOIN resource_devices sensor_device ON sensor_device.bin_id = b.id
    AND sensor_device.device_type = 'BIN' AND sensor_device.status = 'ACTIVE'
  LEFT JOIN LATERAL (
    SELECT fill_level, battery_level, sensor_status, overflow_detected, measured_at
    FROM bin_sensor_readings WHERE bin_id = b.id
    ORDER BY measured_at DESC, id DESC LIMIT 1
  ) sensor ON TRUE`;

exports.list = async (scope = {}, pagination = { limit: 50, offset: 0 }) => {
  let query = selection;
  let values = [];
  if (scope.collectorId !== undefined) {
    query += ` WHERE h.collector_id = $2 AND company_has_active_district(r.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
    values = [onlineWindowSeconds, scope.collectorId];
  } else if (scope.companyId !== undefined) {
    query += ` WHERE r.company_id = $2 AND company_has_active_district(r.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
    values = [onlineWindowSeconds, scope.companyId];
  } else {
    values = [onlineWindowSeconds];
  }
  values.push(pagination.limit, pagination.offset);
  const result = await pool.query(
    `${query} ORDER BY b.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
};

exports.listFull = async (scope = {}, pagination = { limit: 50, offset: 0 }) => {
  let query = selection + " WHERE b.status IN ('HIGH', 'FULL')";
  const values = [onlineWindowSeconds];
  if (scope.collectorId !== undefined) {
    values.push(scope.collectorId);
    query += ` AND h.collector_id = $${values.length}
      AND company_has_active_district(r.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
  } else if (scope.companyId !== undefined) {
    values.push(scope.companyId);
    query += ` AND r.company_id = $${values.length}
      AND company_has_active_district(r.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
  }
  values.push(pagination.limit, pagination.offset);
  const result = await pool.query(`${query} ORDER BY b.fill_level DESC, b.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(`${selection} WHERE b.id = $2`, [onlineWindowSeconds, id]);
  return result.rows[0] || null;
};

exports.findByHouseholdId = async (householdId) => {
  const result = await pool.query(
    `${selection} WHERE b.household_id = $2`,
    [onlineWindowSeconds, householdId]
  );
  return result.rows[0] || null;
};

exports.create = async ({ householdId, binCode, capacity }) => {
  const result = await pool.query(
    `INSERT INTO waste_bins (household_id, bin_code, capacity)
     VALUES ($1, $2, $3) RETURNING id`,
    [householdId, binCode, capacity]
  );
  return exports.findById(result.rows[0].id);
};

exports.createForHousehold = async (executor, householdId) => {
  const result = await executor.query(
    "INSERT INTO waste_bins (household_id) VALUES ($1) RETURNING id",
    [householdId]
  );
  return result.rows[0].id;
};

exports.update = async (id, { binCode, capacity }) => {
  await pool.query(
    `UPDATE waste_bins
     SET bin_code = COALESCE($1, bin_code), capacity = COALESCE($2, capacity)
     WHERE id = $3`,
    [binCode === undefined ? null : binCode, capacity === undefined ? null : capacity, id]
  );
  return exports.findById(id);
};

exports.updateProgress = async (id, fillLevel, status, executor = pool) => {
  await executor.query(
    "UPDATE waste_bins SET fill_level = $1, status = $2 WHERE id = $3",
    [fillLevel, status, id]
  );
  return exports.findById(id, executor);
};

exports.empty = async (id, executor = pool) => exports.updateProgress(id, 0, "EMPTY", executor);

exports.remove = async (id) => {
  const result = await pool.query("DELETE FROM waste_bins WHERE id = $1", [id]);
  return result.rowCount > 0;
};

exports.statistics = async (scope = {}) => {
  const from = "FROM waste_bins b JOIN households h ON h.id = b.household_id JOIN collectors c ON c.id = h.collector_id JOIN representatives r ON r.id = c.representative_id";
  const values = [];
  let where = "";
  if (scope.collectorId !== undefined) {
    values.push(scope.collectorId);
    where = ` WHERE h.collector_id = $${values.length}
      AND company_has_active_district(r.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
  } else if (scope.companyId !== undefined) {
    values.push(scope.companyId);
    where = ` WHERE r.company_id = $${values.length}
      AND company_has_active_district(r.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
  }
  const result = await pool.query(
    `SELECT COUNT(*)::int AS "totalBins",
      COUNT(*) FILTER (WHERE b.status = 'EMPTY')::int AS "emptyBins",
      COUNT(*) FILTER (WHERE b.status = 'FULL')::int AS "fullBins",
      COUNT(*) FILTER (WHERE b.status = 'HIGH')::int AS "highBins",
      COUNT(*) FILTER (WHERE b.status IN ('HIGH', 'FULL'))::int AS "binsRequiringPickup"
     ${from}${where}`,
    values
  );
  return result.rows[0];
};
