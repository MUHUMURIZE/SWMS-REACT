const { pool } = require("../config/db");

const selection = `SELECT h.id, h.user_id AS "userId", h.collector_id AS "collectorId",
  h.address, h.national_id AS "nationalId", u.full_name AS "fullName", u.email, u.phone,
  h.district, h.sector, h.cell, h.village,
  cuser.full_name AS "collectorName", r.company_id AS "companyId",
  u.created_at AS "createdAt", u.updated_at AS "updatedAt"
  FROM households h
  JOIN users u ON u.id = h.user_id
  JOIN collectors c ON c.id = h.collector_id
  JOIN representatives r ON r.id = c.representative_id
  JOIN users cuser ON cuser.id = c.user_id`;

exports.list = async (collectorId = null, pagination = { limit: 50, offset: 0 }) => {
  const result = collectorId === null
    ? await pool.query(`${selection} ORDER BY h.id LIMIT $1 OFFSET $2`, [pagination.limit, pagination.offset])
    : await pool.query(
      `${selection} WHERE h.collector_id = $1
       AND company_has_active_district(r.company_id, h.district)
       AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))
       ORDER BY h.id LIMIT $2 OFFSET $3`,
      [collectorId, pagination.limit, pagination.offset]
    );
  return result.rows;
};

exports.listByCompany = async (companyId, pagination = { limit: 50, offset: 0 }) => {
  const result = await pool.query(
    `${selection} WHERE r.company_id = $1
     AND company_has_active_district(r.company_id, h.district)
     AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))
     ORDER BY h.id LIMIT $2 OFFSET $3`,
    [companyId, pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(`${selection} WHERE h.id = $1`, [id]);
  return result.rows[0] || null;
};

exports.findByUserId = async (userId, executor = pool) => {
  const result = await executor.query(`${selection} WHERE h.user_id = $1`, [userId]);
  return result.rows[0] || null;
};

exports.create = async (executor, userId, collectorId, address, nationalId, { district, sector, cell, village } = {}) => {
  const result = await executor.query(
    `INSERT INTO households (user_id, collector_id, address, national_id, district, sector, cell, village)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [userId, collectorId, address, nationalId || null, district ?? null, sector ?? null, cell ?? null, village ?? null]
  );
  return result.rows[0].id;
};

exports.update = async (id, { fullName, phone, address, nationalId, district, sector, cell, village }) => {
  const lookup = await pool.query("SELECT user_id FROM households WHERE id = $1", [id]);
  if (!lookup.rows[0]) return null;
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      `UPDATE users SET full_name = COALESCE($1, full_name),
       phone = COALESCE($2, phone), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [fullName === undefined ? null : fullName, phone === undefined ? null : phone, lookup.rows[0].user_id]
    );
    await connection.query(
      `UPDATE households SET address = COALESCE($1, address),
       national_id = COALESCE($2, national_id),
       district = COALESCE($3, district), sector = COALESCE($4, sector),
       cell = COALESCE($5, cell), village = COALESCE($6, village) WHERE id = $7`,
      [address ?? null, nationalId ?? null, district ?? null, sector ?? null, cell ?? null, village ?? null, id]
    );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  return exports.findById(id);
};

exports.remove = async (id) => {
  const lookup = await pool.query("SELECT user_id FROM households WHERE id = $1", [id]);
  if (!lookup.rows[0]) return false;
  const dependencies = await pool.query(
    "SELECT 1 FROM collections WHERE household_id = $1 LIMIT 1",
    [id]
  );
  if (dependencies.rows[0]) {
    const error = new Error("A household with collection history cannot be deleted.");
    error.statusCode = 409;
    error.code = "CONFLICT";
    throw error;
  }
  await pool.query("DELETE FROM users WHERE id = $1", [lookup.rows[0].user_id]);
  return true;
};

exports.findByCollectorId = async (id) => {
  const result = await pool.query("SELECT id FROM households WHERE collector_id = $1", [id]);
  return result.rows;
};

exports.findCollectorId = async (id) => {
  const result = await pool.query("SELECT collector_id FROM households WHERE id = $1", [id]);
  return result.rows[0]?.collector_id ?? null;
};
