const { pool } = require("../config/db");

exports.listForUser = async (userId, pagination = { limit: 50, offset: 0 }) => {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", title, message, read_at AS "readAt",
      created_at AS "createdAt"
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [userId, pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.markRead = async (id, userId) => {
  const result = await pool.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return result.rowCount > 0;
};
