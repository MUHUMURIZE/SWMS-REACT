const { pool } = require("../config/db");
const notificationModel = require("../models/notificationModel");
const runTransaction = require("../utils/transaction");

async function addNotificationForUser(executor, userId, notification) {
  if (!userId) return;
  await notificationModel.createForUser(executor, userId, notification);
}

exports.notifyBinFillLevel = async (bin, fillLevel) => {
  if (!bin || ![80, 90, 100].includes(fillLevel)) return;

  const result = await pool.query(
    `SELECT hu.id AS household_user_id,
      cu.id AS collector_user_id,
      ru.id AS representative_user_id,
      h.id AS household_id
     FROM waste_bins b
     JOIN households h ON h.id = b.household_id
     JOIN users hu ON hu.id = h.user_id
     JOIN collectors c ON c.id = h.collector_id
     JOIN users cu ON cu.id = c.user_id
     JOIN representatives r ON r.id = c.representative_id
     JOIN users ru ON ru.id = r.user_id
     WHERE b.id = $1`,
    [bin.id]
  );
  const recipients = result.rows[0];
  if (!recipients) return;

  const notification = fillLevel === 80
    ? {
      title: "Waste bin warning",
      message: `Bin ${bin.binCode} has reached 80% capacity.`,
      category: "BIN_WARNING",
      priority: "normal",
      resourceType: "WASTE_BIN",
      resourceId: bin.id,
    }
    : fillLevel === 90
      ? {
        title: "Waste bin nearly full",
        message: `Bin ${bin.binCode} has reached 90% capacity.`,
        category: "BIN_HIGH_PRIORITY",
        priority: "high",
        resourceType: "WASTE_BIN",
        resourceId: bin.id,
      }
      : {
        title: "Collection required",
        message: `Bin ${bin.binCode} is full and requires collection.`,
        category: "COLLECTION_REQUIRED",
        priority: "critical",
        resourceType: "WASTE_BIN",
        resourceId: bin.id,
      };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await addNotificationForUser(client, recipients.household_user_id, notification);
    await addNotificationForUser(client, recipients.collector_user_id, notification);
    await addNotificationForUser(client, recipients.representative_user_id, notification);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

async function insertCollectionCompletedNotifications(executor, householdId, collectionId) {
  const result = await executor.query(
    `SELECT hu.id AS household_user_id,
      cu.id AS collector_user_id,
      ru.id AS representative_user_id
     FROM households h
     JOIN users hu ON hu.id = h.user_id
     JOIN collectors c ON c.id = h.collector_id
     JOIN users cu ON cu.id = c.user_id
     JOIN representatives r ON r.id = c.representative_id
     JOIN users ru ON ru.id = r.user_id
     WHERE h.id = $1`,
    [householdId]
  );
  const recipients = result.rows[0];
  if (!recipients) return;

  const notification = {
    title: "Waste bin emptied",
    message: "Your completed waste collection has emptied the assigned bin.",
    category: "BIN_EMPTY",
    priority: "normal",
    resourceType: "COLLECTION",
    resourceId: collectionId,
  };
  await addNotificationForUser(executor, recipients.household_user_id, notification);
  await addNotificationForUser(executor, recipients.collector_user_id, notification);
  await addNotificationForUser(executor, recipients.representative_user_id, notification);
}

exports.notifyCollectionCompleted = async (householdId, collectionId, executor) => {
  if (executor) {
    return insertCollectionCompletedNotifications(executor, householdId, collectionId);
  }
  return runTransaction((client) =>
    insertCollectionCompletedNotifications(client, householdId, collectionId)
  );
};
