require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");

test("database business invariants in a rolled-back transaction", async (t) => {
  if (!process.env.DB_NAME) {
    t.skip("DB_NAME is not configured");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const suffix = `${process.pid}_${Date.now()}`;
    const company = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id",
      [`SWMS Integration ${suffix}`]
    );

    const representative = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Test Representative', $1, 'not-a-real-password', 'COMPANY_REPRESENTATIVE') RETURNING id`,
      [`representative-${suffix}@example.test`]
    );
    const representativeProfile = await client.query(
      "INSERT INTO representatives (user_id, company_id) VALUES ($1, $2) RETURNING id",
      [representative.rows[0].id, company.rows[0].id]
    );

    const collector = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Test Collector', $1, 'not-a-real-password', 'COLLECTOR') RETURNING id`,
      [`collector-${suffix}@example.test`]
    );
    const collectorProfile = await client.query(
      "INSERT INTO collectors (user_id, representative_id) VALUES ($1, $2) RETURNING id",
      [collector.rows[0].id, representativeProfile.rows[0].id]
    );

    const household = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Test Household', $1, 'not-a-real-password', 'HOUSEHOLD') RETURNING id`,
      [`household-${suffix}@example.test`]
    );
    const householdProfile = await client.query(
      "INSERT INTO households (user_id, collector_id, address) VALUES ($1, $2, $3) RETURNING id",
      [household.rows[0].id, collectorProfile.rows[0].id, "Integration test address"]
    );

    const bin = await client.query(
      "INSERT INTO waste_bins (household_id, fill_level) VALUES ($1, 85) RETURNING fill_level, status",
      [householdProfile.rows[0].id]
    );
    assert.equal(bin.rows[0].fill_level, 85);
    assert.equal(bin.rows[0].status, "HIGH");

    await assert.rejects(
      client.query(
        `INSERT INTO collections (household_id, collector_id, scheduled_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [householdProfile.rows[0].id, collectorProfile.rows[0].id + 100000]
      ),
      (error) => error.code === "23514"
    );

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});
