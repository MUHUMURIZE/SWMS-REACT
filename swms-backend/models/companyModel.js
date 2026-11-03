const { pool } = require("../config/db");

const selectColumns = 'id, name, created_at AS "createdAt", updated_at AS "updatedAt"';

exports.list = async () => {
  const result = await pool.query(`SELECT ${selectColumns} FROM companies ORDER BY name`);
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(`SELECT ${selectColumns} FROM companies WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

exports.create = async (name) => {
  const result = await pool.query("INSERT INTO companies (name) VALUES ($1) RETURNING id", [name]);
  return exports.findById(result.rows[0].id);
};

exports.update = async (id, name) => {
  if (!(await exports.findById(id))) return null;
  await pool.query("UPDATE companies SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [name, id]);
  return exports.findById(id);
};

exports.remove = async (id) => {
  const result = await pool.query("DELETE FROM companies WHERE id = $1", [id]);
  return result.rowCount > 0;
};
