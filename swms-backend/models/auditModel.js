const { pool } = require("../config/db");

exports.record = async ({
  actorUserId = null,
  action,
  resourceType,
  resourceId = null,
  reason = null,
  ipAddress = null,
  metadata = {},
}, executor = pool) => {
  await executor.query(
    `INSERT INTO audit_logs
      (actor_user_id, action, resource_type, resource_id, reason, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      actorUserId,
      action,
      resourceType,
      resourceId === undefined ? null : String(resourceId),
      reason,
      ipAddress,
      JSON.stringify(metadata),
    ]
  );
};
