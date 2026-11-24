const { pool } = require("../config/db");
const runTransaction = require("../utils/transaction");

async function addHouseholdNotification(client, householdId, title, message) {
  const users = await client.query("SELECT user_id FROM households WHERE id = $1", [householdId]);
  if (!users.rows[0]) return;
  await client.query(
    "INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)",
    [users.rows[0].user_id, title, message]
  );
}

const selection = `SELECT cl.id, cl.household_id AS "householdId",
  cl.collector_id AS "collectorId", cl.scheduled_at AS "scheduledAt", cl.status,
  cl.original_scheduled_at AS "originalScheduledAt", cl.rescheduled_at AS "rescheduledAt",
  cl.notes, cl.collected_at AS "collectedAt", cl.created_by AS "createdBy",
  cl.created_at AS "createdAt", cl.updated_at AS "updatedAt",
  hu.full_name AS "householdName", cu.full_name AS "collectorName",
  rep.id AS "representativeId", rep.company_id AS "companyId"
  FROM collections cl
  JOIN households h ON h.id = cl.household_id
  JOIN users hu ON hu.id = h.user_id
  JOIN collectors c ON c.id = cl.collector_id
  JOIN users cu ON cu.id = c.user_id
  JOIN representatives rep ON rep.id = c.representative_id`;

exports.list = async (
  { role, companyId, collectorId, householdId },
  pagination = { limit: 50, offset: 0 }
) => {
  let where = "";
  let values = [];
  if (role === "COMPANY_REPRESENTATIVE") {
    where = " WHERE rep.company_id = $1";
    values = [companyId];
  } else if (role === "COLLECTOR") {
    where = " WHERE cl.collector_id = $1";
    values = [collectorId];
  } else if (role === "HOUSEHOLD") {
    where = " WHERE h.id = $1";
    values = [householdId];
  }
  const queryValues = [...values, pagination.limit, pagination.offset];
  const limitOffset = values.length
    ? ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`
    : " LIMIT $1 OFFSET $2";
  const result = queryValues.length
    ? await pool.query(`${selection}${where} ORDER BY cl.scheduled_at DESC, cl.id DESC${limitOffset}`, queryValues)
    : await pool.query(`${selection} ORDER BY cl.scheduled_at DESC, cl.id DESC${limitOffset}`, queryValues);
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(`${selection} WHERE cl.id = $1`, [id]);
  return result.rows[0] || null;
};

exports.create = async ({ householdId, collectorId, scheduledAt, status, notes, createdBy }) => {
  const id = await runTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO collections (household_id, collector_id, scheduled_at, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [householdId, collectorId, scheduledAt, status || "pending", notes || null, createdBy]
    );
    await addHouseholdNotification(
      client,
      householdId,
      "Collection scheduled",
      `A waste collection has been scheduled for ${scheduledAt}.`
    );
    return result.rows[0].id;
  });
  return exports.findById(id);
};

exports.update = async (id, { scheduledAt, status, notes }) => {
  await runTransaction(async (client) => {
    const current = await client.query(
      `SELECT status, household_id AS "householdId", scheduled_at AS "scheduledAt",
        original_scheduled_at AS "originalScheduledAt"
       FROM collections WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!current.rows[0]) return;
    await client.query(
      `UPDATE collections SET
        scheduled_at = COALESCE($1, scheduled_at),
        status = COALESCE($2, status),
        notes = COALESCE($3, notes),
        original_scheduled_at = CASE
          WHEN $1::timestamptz IS NOT NULL AND $1::timestamptz IS DISTINCT FROM scheduled_at
          THEN COALESCE(original_scheduled_at, scheduled_at)
          ELSE original_scheduled_at
        END,
        rescheduled_at = CASE
          WHEN $1::timestamptz IS NOT NULL AND $1::timestamptz IS DISTINCT FROM scheduled_at
          THEN CURRENT_TIMESTAMP
          ELSE rescheduled_at
        END,
        collected_at = CASE
          WHEN $4::text IN ('collected', 'completed') THEN COALESCE(collected_at, CURRENT_TIMESTAMP)
          ELSE collected_at
        END
       WHERE id = $5`,
      [
        scheduledAt === undefined ? null : scheduledAt,
        status === undefined ? null : status,
        notes === undefined ? null : notes,
        status || "",
        id,
      ]
    );
    if (status && status !== current.rows[0].status) {
      await addHouseholdNotification(
        client,
        current.rows[0].householdId,
        "Collection status updated",
        `Your collection status is now "${status}".`
      );
    }
  });
  return exports.findById(id);
};

exports.updateStatus = async (id, status) => {
  await runTransaction(async (client) => {
    const current = await client.query(
      "SELECT status, household_id AS \"householdId\" FROM collections WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (!current.rows[0]) return;
    await client.query(
      `UPDATE collections SET status = $1,
        collected_at = CASE
          WHEN $2 IN ('collected', 'completed') THEN COALESCE(collected_at, CURRENT_TIMESTAMP)
          ELSE collected_at
        END
       WHERE id = $3`,
      [status, status, id]
    );
    if (status !== current.rows[0].status) {
      await addHouseholdNotification(
        client,
        current.rows[0].householdId,
        "Collection status updated",
        `Your collection status is now "${status}".`
      );
    }
  });
  return exports.findById(id);
};

exports.remove = async (id) => {
  const result = await pool.query("DELETE FROM collections WHERE id = $1", [id]);
  return result.rowCount > 0;
};

exports.getProgress = async (householdId) => {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM collections WHERE household_id = $1 GROUP BY status`,
    [householdId]
  );
  return result.rows;
};

exports.getHouseholdHistory = async (householdId, limit = 20) => {
  const result = await pool.query(
    `${selection} WHERE h.id = $1 ORDER BY cl.scheduled_at DESC, cl.id DESC LIMIT $2`,
    [householdId, limit]
  );
  return result.rows;
};

exports.getNextForHousehold = async (householdId) => {
  const result = await pool.query(
    `${selection} WHERE h.id = $1 AND cl.status IN ('pending', 'scheduled')
     AND cl.scheduled_at >= CURRENT_TIMESTAMP ORDER BY cl.scheduled_at ASC LIMIT 1`,
    [householdId]
  );
  return result.rows[0] || null;
};

exports.getCurrentForHousehold = async (householdId) => {
  const result = await pool.query(
    `${selection} WHERE h.id = $1 AND cl.status = 'in_progress'
     ORDER BY cl.scheduled_at DESC LIMIT 1`,
    [householdId]
  );
  return result.rows[0] || null;
};

exports.listScheduling = async ({ role, userId, pagination }, mode) => {
  let scope = "";
  let values = [];
  if (role === "HOUSEHOLD") {
    scope = " AND h.user_id = $1";
    values.push(userId);
  } else if (role === "COLLECTOR") {
    scope = " AND c.user_id = $1";
    values.push(userId);
  } else if (role === "COMPANY_REPRESENTATIVE") {
    scope = " AND rep.user_id = $1";
    values.push(userId);
  }

  let predicate = "";
  if (mode === "upcoming") {
    predicate = " AND cl.status IN ('pending','scheduled') AND cl.scheduled_at >= CURRENT_TIMESTAMP";
  } else if (mode === "missed") {
    predicate = " AND cl.status = 'missed'";
  } else if (mode === "overdue") {
    predicate = " AND cl.status IN ('pending','scheduled') AND cl.scheduled_at < CURRENT_TIMESTAMP";
  } else if (mode === "rescheduled") {
    predicate = " AND cl.rescheduled_at IS NOT NULL";
  } else {
    return [];
  }

  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(pagination.limit, pagination.offset);
  const result = await pool.query(
    `${selection} WHERE 1=1${scope}${predicate}
     ORDER BY cl.scheduled_at ASC, cl.id DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values
  );
  return result.rows;
};
