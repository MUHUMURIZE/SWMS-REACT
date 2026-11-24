const { pool } = require("../config/db");

const selectColumns = `id, name, district, sector, cell, village,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

exports.list = async (pagination = { limit: 50, offset: 0 }) => {
  const result = await pool.query(
    `SELECT ${selectColumns} FROM companies ORDER BY name LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(`SELECT ${selectColumns} FROM companies WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

exports.create = async (name, { district, sector, cell, village } = {}) => {
  const result = await pool.query(
    `INSERT INTO companies (name, district, sector, cell, village)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, district ?? null, sector ?? null, cell ?? null, village ?? null]
  );
  return exports.findById(result.rows[0].id);
};

exports.update = async (id, name, { district, sector, cell, village } = {}) => {
  if (!(await exports.findById(id))) return null;
  await pool.query(
    `UPDATE companies SET name = $1,
     district = COALESCE($2, district), sector = COALESCE($3, sector),
     cell = COALESCE($4, cell), village = COALESCE($5, village),
     updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
    [name, district ?? null, sector ?? null, cell ?? null, village ?? null, id]
  );
  return exports.findById(id);
};

exports.remove = async (id) => {
  const result = await pool.query("DELETE FROM companies WHERE id = $1", [id]);
  return result.rowCount > 0;
};
