const { pool } = require("../config/db");

const selection = `SELECT h.id, h.user_id AS "userId", h.collector_id AS "collectorId",
  h.address, h.national_id AS "nationalId", u.full_name AS "fullName", u.email, u.phone,
  cuser.full_name AS "collectorName", r.company_id AS "companyId",
  u.created_at AS "createdAt", u.updated_at AS "updatedAt"
  FROM households h
  JOIN users u ON u.id = h.user_id
  JOIN collectors c ON c.id = h.collector_id
  JOIN representatives r ON r.id = c.representative_id
  JOIN users cuser ON cuser.id = c.user_id`;

exports.list = async (collectorId = null) => {
  const result = collectorId === null
    ? await pool.query(`${selection} ORDER BY h.id`)
    : await pool.query(`${selection} WHERE h.collector_id = $1 ORDER BY h.id`, [collectorId]);
  return result.rows;
};

exports.listByCompany = async (companyId) => {
  const result = await pool.query(
    `${selection} WHERE r.company_id = $1 ORDER BY h.id`,
    [companyId]
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

exports.create = async (executor, userId, collectorId, address, nationalId) => {
  const result = await executor.query(
    "INSERT INTO households (user_id, collector_id, address, national_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [userId, collectorId, address, nationalId || null]
  );
  return result.rows[0].id;
};

exports.update = async (id, { fullName, phone, address, nationalId }) => {
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
       national_id = COALESCE($2, national_id) WHERE id = $3`,
      [address === undefined ? null : address, nationalId === undefined ? null : nationalId, id]
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
