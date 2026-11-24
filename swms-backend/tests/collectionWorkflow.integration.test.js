require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { pool } = require("../config/db");
const collectionModel = require("../models/collectionModel");
const auditModel = require("../models/auditModel");

async function createFixture(t, initialStatus = "collected") {
  const client = await pool.connect();
  const suffix = randomUUID();
  let fixture;
  try {
    await client.query("BEGIN");
    const company = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id",
      [`Workflow ${suffix}`]
    );
    const representativeUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Workflow Representative', $1, 'integration-test-hash', 'COMPANY_REPRESENTATIVE')
       RETURNING id`,
      [`workflow-rep-${suffix}@example.test`]
    );
    const representative = await client.query(
      "INSERT INTO representatives (user_id, company_id) VALUES ($1, $2) RETURNING id",
      [representativeUser.rows[0].id, company.rows[0].id]
    );
    const collectorUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Workflow Collector', $1, 'integration-test-hash', 'COLLECTOR')
       RETURNING id`,
      [`workflow-collector-${suffix}@example.test`]
    );
    const collector = await client.query(
      "INSERT INTO collectors (user_id, representative_id) VALUES ($1, $2) RETURNING id",
      [collectorUser.rows[0].id, representative.rows[0].id]
    );
    const householdUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Workflow Household', $1, 'integration-test-hash', 'HOUSEHOLD')
       RETURNING id`,
      [`workflow-household-${suffix}@example.test`]
    );
    const household = await client.query(
      `INSERT INTO households (user_id, collector_id, address)
       VALUES ($1, $2, 'Workflow integration test address') RETURNING id`,
      [householdUser.rows[0].id, collector.rows[0].id]
    );
    const bin = await client.query(
      "INSERT INTO waste_bins (household_id, fill_level) VALUES ($1, 90) RETURNING id",
      [household.rows[0].id]
    );
    const collection = await client.query(
      `INSERT INTO collections (household_id, collector_id, scheduled_at, status, created_by)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 day', 'pending', $3) RETURNING id`,
      [household.rows[0].id, collector.rows[0].id, collectorUser.rows[0].id]
    );

    if (initialStatus !== "pending") {
      for (const status of ["scheduled", "in_progress", "collected"]) {
        await client.query(
          "UPDATE collections SET status = $1 WHERE id = $2",
          [status, collection.rows[0].id]
        );
        if (status === initialStatus) break;
      }
    }

    await client.query("COMMIT");
    fixture = {
      companyId: company.rows[0].id,
      userIds: [
        representativeUser.rows[0].id,
        collectorUser.rows[0].id,
        householdUser.rows[0].id,
      ],
      collectorUserId: collectorUser.rows[0].id,
      householdId: household.rows[0].id,
      binId: bin.rows[0].id,
      collectionId: collection.rows[0].id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  t.after(async () => {
    await pool.query(
      "DELETE FROM audit_logs WHERE resource_type = 'COLLECTION' AND resource_id = $1",
      [String(fixture.collectionId)]
    );
    await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [fixture.userIds]);
    await pool.query("DELETE FROM companies WHERE id = $1", [fixture.companyId]);
  });
  return fixture;
}

test("PostgreSQL permits valid initial states and rejects terminal states and invalid transitions", async (t) => {
  const fixture = await createFixture(t, "pending");

  for (const status of ["pending", "scheduled"]) {
    await pool.query(
      `INSERT INTO collections (household_id, collector_id, scheduled_at, status)
       VALUES ($1, (SELECT collector_id FROM households WHERE id = $1),
         CURRENT_TIMESTAMP + INTERVAL '1 day', $2)`,
      [fixture.householdId, status]
    );
  }
  for (const status of ["in_progress", "collected", "completed", "missed", "cancelled"]) {
    await assert.rejects(
      pool.query(
        `INSERT INTO collections (household_id, collector_id, scheduled_at, status)
         VALUES ($1, (SELECT collector_id FROM households WHERE id = $1),
           CURRENT_TIMESTAMP + INTERVAL '1 day', $2)`,
        [fixture.householdId, status]
      ),
      (error) => error.code === "23514"
    );
  }

  await collectionModel.updateStatus(fixture.collectionId, "scheduled");
  await collectionModel.updateStatus(fixture.collectionId, "in_progress");
  await collectionModel.updateStatus(fixture.collectionId, "collected");
  await assert.rejects(
    collectionModel.updateStatus(fixture.collectionId, "scheduled"),
    (error) => error.code === "23514"
  );
  assert.equal((await collectionModel.findById(fixture.collectionId)).status, "collected");
});

test("concurrent and repeated completion atomically empty the bin and create one notification set and audit record", async (t) => {
  const fixture = await createFixture(t);
  const audit = {
    actorUserId: fixture.collectorUserId,
    action: "COLLECTION_STATUS_UPDATED",
    ipAddress: "127.0.0.1",
    metadata: { status: "completed" },
  };

  await Promise.all(Array.from({ length: 6 }, () =>
    collectionModel.updateStatus(fixture.collectionId, "completed", audit)
  ));
  await collectionModel.updateStatus(fixture.collectionId, "completed", audit);

  const result = await pool.query(
    `SELECT cl.status, b.fill_level, b.status AS bin_status,
       (SELECT COUNT(*)::int FROM notifications
        WHERE category = 'BIN_EMPTY' AND resource_id = cl.id::text) AS completion_notifications,
       (SELECT COUNT(*)::int FROM notifications
        WHERE user_id = h.user_id AND title = 'Collection status updated') AS status_notifications,
       (SELECT COUNT(*)::int FROM audit_logs
        WHERE resource_type = 'COLLECTION' AND resource_id = cl.id::text
          AND action = 'COLLECTION_STATUS_UPDATED') AS audit_records
     FROM collections cl
     JOIN waste_bins b ON b.household_id = cl.household_id
     JOIN households h ON h.id = cl.household_id
     WHERE cl.id = $1
     GROUP BY cl.id, b.id, h.user_id`,
    [fixture.collectionId]
  );
  assert.equal(result.rows[0].status, "completed");
  assert.equal(result.rows[0].fill_level, 0);
  assert.equal(result.rows[0].bin_status, "EMPTY");
  assert.equal(result.rows[0].completion_notifications, 3);
  assert.equal(result.rows[0].status_notifications, 1);
  assert.equal(result.rows[0].audit_records, 1);
});

test("a failed audit write rolls back collection, bin, and notification changes", async (t) => {
  const fixture = await createFixture(t);
  t.mock.method(auditModel, "record", async () => {
    throw new Error("simulated audit storage failure");
  });

  await assert.rejects(
    collectionModel.updateStatus(fixture.collectionId, "completed", {
      actorUserId: fixture.collectorUserId,
      action: "COLLECTION_STATUS_UPDATED",
      ipAddress: "127.0.0.1",
      metadata: { status: "completed" },
    }),
    /simulated audit storage failure/
  );

  const result = await pool.query(
    `SELECT cl.status, b.fill_level,
       (SELECT COUNT(*)::int FROM notifications WHERE user_id = ANY($2::int[])) AS notifications
     FROM collections cl
     JOIN waste_bins b ON b.household_id = cl.household_id
     WHERE cl.id = $1`,
    [fixture.collectionId, fixture.userIds]
  );
  assert.equal(result.rows[0].status, "collected");
  assert.equal(result.rows[0].fill_level, 90);
  assert.equal(result.rows[0].notifications, 0);
});
