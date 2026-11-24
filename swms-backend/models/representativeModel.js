const { pool } = require("../config/db");

const selection = `SELECT r.id, r.user_id AS "userId", r.company_id AS "companyId",
  c.name AS "companyName", u.full_name AS "fullName", u.email, u.phone,
  r.district, r.sector, r.cell, r.village,
  u.created_at AS "createdAt", u.updated_at AS "updatedAt"
  FROM representatives r
  JOIN users u ON u.id = r.user_id
  JOIN companies c ON c.id = r.company_id`;

exports.list = async (pagination = { limit: 50, offset: 0 }) => {
  const result = await pool.query(
    `${selection} ORDER BY r.id LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(`${selection} WHERE r.id = $1`, [id]);
  return result.rows[0] || null;
};

exports.findByUserId = async (userId) => {
  const result = await pool.query(`${selection} WHERE r.user_id = $1`, [userId]);
  return result.rows[0] || null;
};

exports.create = async (executor, userId, companyId, { district, sector, cell, village } = {}) => {
  const result = await executor.query(
    `INSERT INTO representatives (user_id, company_id, district, sector, cell, village)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, companyId, district ?? null, sector ?? null, cell ?? null, village ?? null]
  );
  return result.rows[0].id;
};

exports.update = async (id, { fullName, phone, companyId, district, sector, cell, village }) => {
  const lookup = await pool.query("SELECT user_id FROM representatives WHERE id = $1", [id]);
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
      `UPDATE representatives SET company_id = COALESCE($1, company_id),
       district = COALESCE($2, district), sector = COALESCE($3, sector),
       cell = COALESCE($4, cell), village = COALESCE($5, village) WHERE id = $6`,
      [companyId ?? null, district ?? null, sector ?? null, cell ?? null, village ?? null, id]
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
  const lookup = await pool.query("SELECT user_id FROM representatives WHERE id = $1", [id]);
  if (!lookup.rows[0]) return false;
  await pool.query("DELETE FROM users WHERE id = $1", [lookup.rows[0].user_id]);
  return true;
};
