# PostgreSQL migration checklist

This migration keeps all API paths, JSON fields, role rules, and collection workflows unchanged. The runtime now uses the `pg` Pool API and PostgreSQL-specific SQL.

## Code conversion checklist

- [x] Replace the MySQL connection pool with `pg.Pool` in `config/db.js`.
- [x] Use PostgreSQL's `query()` result shape (`result.rows`, `result.rowCount`).
- [x] Convert positional placeholders to `$1`, `$2`, and so on.
- [x] Use `RETURNING id` for generated identifiers instead of `insertId`.
- [x] Use `pool.connect()` and explicit `BEGIN` / `COMMIT` / `ROLLBACK` for transactions.
- [x] Use PostgreSQL `SERIAL` keys, `INTEGER` foreign keys, enum types, and `TIMESTAMPTZ`.
- [x] Map PostgreSQL uniqueness and foreign-key errors (`23505`, `23503`) to API conflict responses.
- [x] Configure the environment template for PostgreSQL.
- [x] Keep API URLs and request bodies unchanged; publish the current routes and validation-backed request schemas through Swagger/OpenAPI.

## PostgreSQL setup

Install PostgreSQL 14 or newer and the matching `psql`, `pg_dump`, and `pg_restore` client tools. Use a separate database and credentials for each environment. The mixed-case example name must be quoted:

```sql
CREATE DATABASE "SWMS_db";
```

Equivalent PowerShell commands, run from `swms-backend`:

```powershell
createdb -U postgres "SWMS_db"
psql -U postgres -d "SWMS_db" -f database\schema.sql
psql -U postgres -d "SWMS_db" -c "\dt"
psql -U postgres -d "SWMS_db" -c "\d+ users"
psql -U postgres -d "SWMS_db" -c "\dT+"
psql -U postgres -d "SWMS_db" -c "SELECT typname, enumlabel FROM pg_type JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid WHERE typname IN ('user_role', 'collection_status') ORDER BY typname, enumsortorder;"
```

Configure local `.env` using `.env.example` as a template. Production requires `DB_SSL_MODE=verify-full`; an optional `DB_SSL_CA_FILE` points to a trusted PEM CA bundle. Production refuses TLS disablement. Keep database passwords and JWT signing keys in a secret manager, not source control.

## Baseline schema and incremental migrations

### New, empty database

The baseline `database/schema.sql` creates the core schema. The migration runner does not apply this baseline automatically. From `swms-backend`, initialize only a newly created, empty database as follows:

```powershell
psql -U postgres -d "SWMS_db" -v ON_ERROR_STOP=1 -f database\schema.sql
npm run migrate
```

Do not run the baseline against a live database as a substitute for incremental migrations.

### Existing SWMS database

1. Confirm the target database and environment before connecting.
2. Take and verify a restorable backup.
3. Run `npm run migrate` from `swms-backend` using that environment's connection configuration. Do not rerun `database/schema.sql`.
4. The runner takes a PostgreSQL advisory lock and applies unapplied SQL files in lexical order. The complete incremental migration order is:

   1. `002_household_exactly_one_bin.sql`
   2. `003_add_location_fields.sql`
   3. `004_security_and_integrity.sql`
   4. `005_operational_features.sql`
   5. `006_bin_fill_history.sql`
   6. `007_collection_lifecycle_initial_status.sql`
   7. `008_district_company_agreements.sql`
   8. `009_company_district_authorization.sql`
   9. `010_fleet_management.sql`
   10. `011_gps_iot_devices.sql`

Each numbered migration uses a transaction. The baseline schema is not represented by a numbered entry in `schema_migrations`; the expected ledger contains all ten numbered migrations after initialization.

### Verify migration state

Connect using the same environment credentials used by the application and verify the database identity before reporting status:

```sql
SELECT current_database(), current_setting('server_version');
SELECT name, applied_at FROM schema_migrations ORDER BY name;
SELECT COUNT(*) AS migration_count,
       MAX(name) AS latest_migration
FROM schema_migrations;
```

For the complete current schema, expect 10 rows and `011_gps_iot_devices.sql` as the latest migration. Also verify the GPS/IoT tables and indexes exist, then run application smoke tests. Do not copy development/test migration status into staging or production; query each environment independently.

### Rollback and recovery limitations

There are no automatic down migrations. Do not manually drop tables, reverse triggers, or delete migration-ledger rows to simulate a rollback. For a failed migration, stop the release, retain logs, inspect transaction state, and prepare a reviewed forward-fix. If recovery requires reverting data/schema, restore the pre-release backup or provider PITR into a **new** database, validate schema/data and role scopes there, then perform a controlled application cutover. Keep the original database untouched until the recovery is accepted. Practice this process on a production-equivalent copy before release.

### Fresh migration and backup/restore test

With a non-production PostgreSQL server listening on loopback, PostgreSQL client tools installed (or `PG_BIN_DIR` set), and a role allowed to create/drop databases, run the isolated verification script:

```powershell
$env:SWMS_RECOVERY_TEST_CONFIRM = "YES"
$env:PG_BIN_DIR = "C:\Program Files\PostgreSQL\18\bin"
node scripts\verifyDatabaseRecovery.js
Remove-Item Env:\SWMS_RECOVERY_TEST_CONFIRM
Remove-Item Env:\PG_BIN_DIR
```

The script requires explicit opt-in, rejects production mode and non-loopback hosts, creates two uniquely named databases containing a synthetic fixture only, applies the baseline and all numbered migrations, dumps/restores with `pg_dump`/`pg_restore`, verifies the migration ledger and fixture, and removes only those temporary databases and its temporary archive. This local test does not verify production backup encryption, retention, access controls, or managed PITR.

## Application checks after migration

Check database connectivity and run the test suites before controlled administrator bootstrap and startup:

```powershell
npm test
npm run test:security
npm run test:integration
npm run create-admin
npm start
```

## Existing MySQL data migration

The application schema script creates a new, empty PostgreSQL schema; it does not migrate or delete existing MySQL records. Back up both databases first. Migrate records in foreign-key order: companies, users, representatives, collectors, households, collections, notifications, then revoked tokens. Each company must have at most one representative; resolve any duplicate company assignments before applying the unique index in `database/schema.sql`.

For each table, export columns explicitly from MySQL to CSV (avoid exporting generated IDs/password hashes to an unprotected location). Import with `psql` `\copy` and explicit destination columns. Preserve IDs if relationships reference them; after importing explicit serial IDs, reset each sequence to the table's maximum ID, for example:

```sql
SELECT setval(pg_get_serial_sequence('companies', 'id'),
              COALESCE((SELECT MAX(id) FROM companies), 1),
              EXISTS (SELECT 1 FROM companies));
```

Map legacy role values to `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR`, or `HOUSEHOLD`. Map collection statuses to `pending`, `scheduled`, `in_progress`, `collected`, `completed`, or `missed` before import. Convert MySQL `DATETIME` values with an explicitly agreed timezone; the PostgreSQL schema stores timestamps with time zone.

Before switching traffic, compare per-table row counts, verify foreign-key relationships, check role/status distributions, test login/password verification, confirm company and collector data scopes, test logout/password-change revocation, and run the API smoke tests against the PostgreSQL database. Keep the MySQL backup read-only until the migration is accepted. Do not point the old MySQL-backed application at PostgreSQL or run the new schema against the MySQL database.
