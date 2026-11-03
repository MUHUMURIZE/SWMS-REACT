const { pool } = require("../config/db");

const selection = `SELECT b.id, b.household_id AS "householdId", b.bin_code AS "binCode",
  b.capacity, b.fill_level AS "fillLevel", b.status,
  b.created_at AS "createdAt", b.updated_at AS "updatedAt",
  u.full_name AS "householdName", h.collector_id AS "collectorId",
  r.company_id AS "companyId"
  FROM waste_bins b
  JOIN households h ON h.id = b.household_id
  JOIN users u ON u.id = h.user_id
  JOIN collectors c ON c.id = h.collector_id
  JOIN representatives r ON r.id = c.representative_id`;

exports.list = async (scope = {}) => {
  let query = selection;
  let values = [];
  if (scope.collectorId !== undefined) {
    query += " WHERE h.collector_id = $1";
    values = [scope.collectorId];
  } else if (scope.companyId !== undefined) {
    query += " WHERE r.company_id = $1";
    values = [scope.companyId];
  }
  const result = await pool.query(`${query} ORDER BY b.id`, values);
  return result.rows;
};

exports.listFull = async (scope = {}) => {
  let query = selection + " WHERE b.status IN ('HIGH', 'FULL')";
  const values = [];
  if (scope.collectorId !== undefined) {
    values.push(scope.collectorId);
    query += ` AND h.collector_id = $${values.length}`;
  } else if (scope.companyId !== undefined) {
    values.push(scope.companyId);
    query += ` AND r.company_id = $${values.length}`;
  }
  const result = await pool.query(`${query} ORDER BY b.fill_level DESC, b.id`, values);
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(`${selection} WHERE b.id = $1`, [id]);
  return result.rows[0] || null;
};

exports.findByHouseholdId = async (householdId) => {
  const result = await pool.query(`${selection} WHERE b.household_id = $1`, [householdId]);
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

exports.updateProgress = async (id, fillLevel, status) => {
  await pool.query(
    "UPDATE waste_bins SET fill_level = $1, status = $2 WHERE id = $3",
    [fillLevel, status, id]
  );
  return exports.findById(id);
};

exports.empty = async (id) => exports.updateProgress(id, 0, "EMPTY");

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
    where = ` WHERE h.collector_id = $${values.length}`;
  } else if (scope.companyId !== undefined) {
    values.push(scope.companyId);
    where = ` WHERE r.company_id = $${values.length}`;
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
