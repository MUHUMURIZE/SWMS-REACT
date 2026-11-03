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

Install a supported PostgreSQL server and `psql`, then create the database (the mixed-case name must be quoted):

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

Configure `.env` locally using `.env.example` as a template. The required names are `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASS`, and `DB_PORT`. Keep real database passwords and JWT signing keys out of source control. `JWT_SECRET` must be a randomly generated value of at least 32 characters.

Check connectivity, create the initial administrator, and run tests:

```powershell
npm install
npm test
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
