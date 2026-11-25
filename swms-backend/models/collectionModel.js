const { pool } = require("../config/db");
const runTransaction = require("../utils/transaction");
const binModel = require("./binModel");
const auditModel = require("./auditModel");
const notificationService = require("../services/notificationService");

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
  rep.id AS "representativeId", rep.company_id AS "companyId", h.district
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
    where = ` WHERE rep.company_id = $1
      AND company_has_active_district(rep.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
    values = [companyId];
  } else if (role === "COLLECTOR") {
    where = ` WHERE cl.collector_id = $1
      AND company_has_active_district(rep.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
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

async function updateCollection(id, { scheduledAt, status, notes }, audit) {
  const updatedId = await runTransaction(async (client) => {
    const result = await client.query(
      `SELECT status, household_id AS "householdId", scheduled_at AS "scheduledAt", notes
       FROM collections WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const current = result.rows[0];
    if (!current) return null;

    const nextStatus = status === undefined ? current.status : status;
    const statusChanged = nextStatus !== current.status;
    const scheduleChanged = scheduledAt !== undefined
      && new Date(scheduledAt).getTime() !== new Date(current.scheduledAt).getTime();
    const notesChanged = notes !== undefined && notes !== current.notes;

    if (statusChanged || scheduleChanged || notesChanged) {
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
    }

    if (statusChanged) {
      await addHouseholdNotification(
        client,
        current.householdId,
        "Collection status updated",
        `Your collection status is now "${nextStatus}".`
      );
    }

    if (statusChanged && nextStatus === "completed") {
      const bin = await client.query(
        "SELECT id FROM waste_bins WHERE household_id = $1 FOR UPDATE",
        [current.householdId]
      );
      if (!bin.rows[0]) {
        const error = new Error("The household's waste bin is unavailable.");
        error.statusCode = 409;
        error.code = "CONFLICT";
        throw error;
      }
      await binModel.empty(bin.rows[0].id, client);
      await notificationService.notifyCollectionCompleted(current.householdId, id, client);
    }

    const repeatedCompletion = current.status === "completed"
      && nextStatus === "completed"
      && !scheduleChanged
      && !notesChanged;
    if (audit && !repeatedCompletion) {
      await auditModel.record({
        ...audit,
        resourceType: "COLLECTION",
        resourceId: id,
      }, client);
    }
    return id;
  });
  return updatedId === null ? null : exports.findById(updatedId);
}

exports.update = (id, changes, audit) => updateCollection(id, changes, audit);
exports.updateStatus = (id, status, audit) => updateCollection(id, { status }, audit);

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
    scope = ` AND c.user_id = $1 AND company_has_active_district(rep.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
    values.push(userId);
  } else if (role === "COMPANY_REPRESENTATIVE") {
    scope = ` AND rep.user_id = $1 AND company_has_active_district(rep.company_id, h.district)
      AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))`;
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
