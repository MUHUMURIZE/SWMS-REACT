require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../config/db");

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("SELECT pg_advisory_lock(hashtext('swms-migrations'))");

    const migrationDirectory = path.join(__dirname, "..", "database", "migrations");
    const files = fs.readdirSync(migrationDirectory)
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const name of files) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [name]
      );
      if (applied.rows[0]) continue;

      const sql = fs.readFileSync(path.join(migrationDirectory, name), "utf8");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ($1)",
        [name]
      );
      console.log(`Applied migration ${name}`);
    }

    await client.query("SELECT pg_advisory_unlock(hashtext('swms-migrations'))");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
