const { pool } = require("../config/db");

exports.listForUser = async (userId, pagination = { limit: 50, offset: 0 }) => {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", title, message, read_at AS "readAt",
      category, priority, resource_type AS "resourceType", resource_id AS "resourceId",
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

exports.createForUser = async (executor, userId, {
  title,
  message,
  category,
  priority = "normal",
  resourceType = null,
  resourceId = null,
}) => {
  const result = await executor.query(
    `INSERT INTO notifications
      (user_id, title, message, category, priority, resource_type, resource_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, title, message, category, priority, resourceType,
      resourceId === undefined || resourceId === null ? null : String(resourceId)]
  );
  return result.rows[0];
};
