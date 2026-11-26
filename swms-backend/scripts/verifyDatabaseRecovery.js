require("dotenv").config();

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { pool: adminPool, databaseConfig } = require("../config/db");

const migrationDirectory = path.join(__dirname, "..", "database", "migrations");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const pgBinDirectory = process.env.PG_BIN_DIR;
const toolPath = (name) => {
  if (!pgBinDirectory) return name;
  return path.join(pgBinDirectory, process.platform === "win32" ? `${name}.exe` : name);
};

function assertIsolatedLocalRun() {
  const host = (process.env.DB_HOST || "localhost").toLowerCase();
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (process.env.NODE_ENV === "production"
    || process.env.SWMS_RECOVERY_TEST_CONFIRM !== "YES"
    || !loopback
    || !process.env.DB_NAME) {
    throw new Error(
      "Recovery verification requires a non-production environment, loopback DB_HOST, DB_NAME, and SWMS_RECOVERY_TEST_CONFIRM=YES."
    );
  }
}

function postgresEnvironment() {
  const env = {
    ...process.env,
    PGHOST: process.env.DB_HOST || "localhost",
    PGPORT: process.env.DB_PORT || "5432",
    PGUSER: process.env.DB_USER || "",
    PGSSLMODE: process.env.DB_SSL_MODE === "verify-full" ? "verify-full" : "disable",
  };
  const password = process.env.DB_PASS || process.env.DB_PASSWORD;
  if (password) env.PGPASSWORD = password;
  if (process.env.DB_SSL_CA_FILE) env.PGSSLROOTCERT = process.env.DB_SSL_CA_FILE;
  return env;
}

function runTool(name, args) {
  const result = spawnSync(toolPath(name), args, {
    cwd: path.join(__dirname, ".."),
    env: postgresEnvironment(),
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${name} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result.stdout.trim();
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function createDatabase(databaseName) {
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
}

async function dropDatabase(databaseName) {
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
}

async function assertDatabaseContents(databasePool, marker, expectedMigrations) {
  const migrations = await databasePool.query(
    "SELECT name FROM schema_migrations ORDER BY name"
  );
  const company = await databasePool.query(
    "SELECT 1 FROM companies WHERE name = $1",
    [marker]
  );
  if (migrations.rows.length !== expectedMigrations.length
    || migrations.rows.some((row, index) => row.name !== expectedMigrations[index])
    || company.rowCount !== 1) {
    throw new Error("Restored database did not match the migration history and synthetic fixture.");
  }
  return migrations.rows.length;
}

async function main() {
  assertIsolatedLocalRun();

  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const sourceName = `swms_recovery_src_${suffix}`;
  const restoreName = `swms_recovery_dst_${suffix}`;
  const backupPath = path.join(os.tmpdir(), `swms_recovery_${suffix}.dump`);
  const marker = `Recovery Verification ${suffix}`;
  const expectedMigrations = fs.readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  let sourceCreated = false;
  let restoreCreated = false;
  let sourcePool;
  let restorePool;
  let verificationResult;
  let originalError;

  try {
    await createDatabase(sourceName);
    sourceCreated = true;
    sourcePool = new Pool(databaseConfig(sourceName));
    await sourcePool.query(fs.readFileSync(schemaPath, "utf8"));

    const migration = spawnSync(process.execPath, [path.join(__dirname, "migrate.js")], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DB_NAME: sourceName },
      encoding: "utf8",
      windowsHide: true,
    });
    if (migration.error) throw migration.error;
    if (migration.status !== 0) {
      throw new Error(`Fresh database migration failed: ${(migration.stderr || migration.stdout || "").trim()}`);
    }

    await sourcePool.query("INSERT INTO companies (name) VALUES ($1)", [marker]);
    const sourceMigrationCount = await assertDatabaseContents(
      sourcePool,
      marker,
      expectedMigrations
    );

    runTool("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file",
      backupPath,
      "--dbname",
      sourceName,
    ]);

    await createDatabase(restoreName);
    restoreCreated = true;
    runTool("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "--dbname",
      restoreName,
      backupPath,
    ]);
    restorePool = new Pool(databaseConfig(restoreName));
    const restoredMigrationCount = await assertDatabaseContents(
      restorePool,
      marker,
      expectedMigrations
    );
    verificationResult = {
      baselineSchemaApplied: true,
      migrationsApplied: sourceMigrationCount,
      backupCreated: fs.statSync(backupPath).size > 0,
      restoredDatabaseVerified: true,
      restoredMigrationCount,
      syntheticFixtureVerified: true,
      backupFormat: "PostgreSQL custom archive",
    };
  } catch (error) {
    originalError = error;
  } finally {
    const pools = [sourcePool, restorePool].filter(Boolean);
    const closeResults = await Promise.allSettled(pools.map((databasePool) => databasePool.end()));
    const closeFailure = closeResults.find((result) => result.status === "rejected");
    if (closeFailure && !originalError) originalError = closeFailure.reason;

    for (const [databaseName, created] of [
      [restoreName, restoreCreated],
      [sourceName, sourceCreated],
    ]) {
      if (!created) continue;
      try {
        await dropDatabase(databaseName);
      } catch (error) {
        if (!originalError) originalError = error;
        console.error(`Could not remove isolated recovery database ${databaseName}: ${error.message}`);
      }
    }

    try {
      if (fs.existsSync(backupPath)) fs.rmSync(backupPath);
    } catch (error) {
      if (!originalError) originalError = error;
      console.error(`Could not remove temporary recovery archive: ${error.message}`);
    }
    await adminPool.end();
  }

  if (originalError) throw originalError;
  console.log(JSON.stringify(verificationResult, null, 2));
}

main().catch((error) => {
  console.error(`Database recovery verification failed: ${error.message}`);
  process.exitCode = 1;
});
