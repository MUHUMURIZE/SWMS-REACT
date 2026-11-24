const { pool } = require("../config/db");

exports.findByEmail = async (email, executor = pool) => {
  const result = await executor.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0] || null;
};

exports.findPublicById = async (id, executor = pool) => {
  const result = await executor.query(
    `SELECT id, full_name AS "fullName", email, role, phone,
      created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

exports.create = async (executor, { fullName, email, passwordHash, role, phone }) => {
  const result = await executor.query(
    "INSERT INTO users (full_name, email, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [fullName, email, passwordHash, role, phone || null]
  );
  return result.rows[0].id;
};

exports.updateProfile = async (id, { fullName, phone }) => {
  await pool.query(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      phone = COALESCE($2, phone)
     WHERE id = $3`,
    [fullName === undefined ? null : fullName, phone === undefined ? null : phone, id]
  );
  return exports.findPublicById(id);
};

exports.updatePassword = async (id, passwordHash) => {
  await pool.query(
    "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2",
    [passwordHash, id]
  );
};

exports.revokeToken = async (jti, userId, expiresAt) => {
  await pool.query(
    "INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)",
    [jti, userId, expiresAt]
  );
};

exports.purgeExpiredRevocations = async (executor = pool) => {
  await executor.query("DELETE FROM revoked_tokens WHERE expires_at < CURRENT_TIMESTAMP");
};

exports.getTokenVersion = async (id) => {
  const result = await pool.query("SELECT token_version FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
};
