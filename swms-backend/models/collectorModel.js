const { pool } = require("../config/db");

const selection = `SELECT c.id, c.user_id AS "userId", c.representative_id AS "representativeId",
  r.company_id AS "companyId", u.full_name AS "fullName", u.email, u.phone,
  ruser.full_name AS "representativeName", u.created_at AS "createdAt", u.updated_at AS "updatedAt"
  FROM collectors c
  JOIN users u ON u.id = c.user_id
  JOIN representatives r ON r.id = c.representative_id
  JOIN users ruser ON ruser.id = r.user_id`;

exports.list = async (companyId = null) => {
  const result = companyId === null
    ? await pool.query(`${selection} ORDER BY c.id`)
    : await pool.query(`${selection} WHERE r.company_id = $1 ORDER BY c.id`, [companyId]);
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(`${selection} WHERE c.id = $1`, [id]);
  return result.rows[0] || null;
};

exports.findByUserId = async (userId) => {
  const result = await pool.query(`${selection} WHERE c.user_id = $1`, [userId]);
  return result.rows[0] || null;
};

exports.create = async (executor, userId, representativeId) => {
  const result = await executor.query(
    "INSERT INTO collectors (user_id, representative_id) VALUES ($1, $2) RETURNING id",
    [userId, representativeId]
  );
  return result.rows[0].id;
};

exports.update = async (id, { fullName, phone, representativeId }) => {
  const lookup = await pool.query("SELECT user_id FROM collectors WHERE id = $1", [id]);
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
      "UPDATE collectors SET representative_id = COALESCE($1, representative_id) WHERE id = $2",
      [representativeId === undefined ? null : representativeId, id]
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
  const lookup = await pool.query("SELECT user_id FROM collectors WHERE id = $1", [id]);
  if (!lookup.rows[0]) return false;
  await pool.query("DELETE FROM users WHERE id = $1", [lookup.rows[0].user_id]);
  return true;
};
