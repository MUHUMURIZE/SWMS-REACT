# SWMS Production Deployment Guide

This guide describes the required deployment controls; it does not assert that any staging or production environment is configured. Do not copy real credentials into this file or `.env.example`.

## 1. Supported runtime and infrastructure

- PostgreSQL 14 or newer; current local validation used PostgreSQL 18.2.
- Node.js 20 or newer.
- A trusted HTTPS reverse proxy or managed load balancer in front of the API.
- Redis with TLS for shared API rate limits.
- A secret manager for database, Redis, JWT-signing, device-provisioning, and backup-encryption credentials.
- A production process manager or orchestrator that forwards `SIGTERM` and allows 30 seconds for graceful shutdown.

No container, cloud, reverse-proxy, or orchestration configuration is included in this repository. Provision and verify those services independently.

## 2. Environment configuration

The backend reads `.env` for local use and the frontend reads `VITE_API_BASE_URL` at build time. In deployed environments, inject values using the platform's secret/configuration manager. Do not log or publish secret values.

| Variable | Requirement |
|---|---|
| `NODE_ENV` | `production` for deployed production. |
| `PORT` | API listen port. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` (or `DB_PASSWORD`) | PostgreSQL endpoint and application credentials. Do not place the password in command arguments. |
| `DB_CONNECTION_LIMIT` | Maximum pool size; size against the database connection budget and replica count. |
| `DB_SSL_MODE` | **Required in production:** `verify-full`. Production startup rejects missing, disabled, or unsupported modes. Local development defaults to `disable`; set `verify-full` when testing TLS locally. |
| `DB_SSL_CA_FILE` | Optional path to a PEM CA bundle for a private/managed database CA. If omitted, Node's trusted CA store is used. Certificate verification is never disabled in production. |
| `JWT_SECRET` | Random signing secret of at least 32 characters, stored and rotated through the secret manager. |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Must match the API's configured JWT verification values. |
| `CORS_ORIGINS` | Comma-separated exact HTTPS frontend origins. Production requires at least one. |
| `REDIS_URL` | Required in production and must use `rediss://`; configure authentication, network restrictions, and certificate validation in the Redis service. |
| `TRUST_PROXY_HOPS` | Exact number of trusted reverse-proxy hops; use `0` when directly exposed. Do not trust untrusted forwarded headers. |
| `VITE_API_BASE_URL` | Required at frontend build time; set to the HTTPS API origin. The frontend fallback is localhost and is not suitable for production. |
| `SWAGGER_ENABLED` | Keep `false` in production unless documentation is intentionally exposed and protected. |
| `DEVICE_ONLINE_WINDOW_SECONDS` | Optional freshness window; agree on a value appropriate to the device reporting interval. |
| `API_RATE_LIMIT_PER_15_MINUTES` | Default `600` per client IP for general API routes. |
| `AUTH_RATE_LIMIT_PER_15_MINUTES` | Default `60` per client IP on `/api/auth`; failed login has an additional 10-per-15-minute IP/email limit. |
| `DEVICE_INGESTION_IP_LIMIT_PER_MINUTE` | Default `12000` per source IP, shared across ingestion routes. Tune for gateways/NATs and expected fleet size. |
| `GPS_DEVICE_INGESTION_LIMIT_PER_MINUTE` | Default `600` per authenticated GPS device. |
| `IOT_DEVICE_INGESTION_LIMIT_PER_MINUTE` | Default `120` per authenticated bin device. |
| `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Supply only for a controlled first-admin bootstrap; remove/disable after use. |

Production rate-limit counters use shared Redis storage; Redis connection failures fail closed rather than falling back to process-local counters. The API returns HTTP 429 when a configured limit is exceeded. The general API limiter excludes GPS and IoT ingestion, which have a high per-IP guard and independent per-device limits. Tune limits from observed legitimate traffic; never set them to zero.

There is no password-recovery endpoint. If one is added, keep it under `/api/auth` so it receives the authentication request limit, and add a stricter route-specific limit before release.

## 3. Environment separation and verification

Maintain separate credentials, PostgreSQL databases, Redis instances/namespaces, frontend origins, and secret stores for each environment.

| Environment | Recommended configuration | Verification state |
|---|---|---|
| Local development | `DB_SSL_MODE=disable` is allowed; Redis may be omitted and limits are process-local. Use synthetic/test data only. | The configured local database used during this hardening task was loopback and non-production. Its migration history includes 011. |
| CI/test | Use a separate database and Redis namespace. Prefer PostgreSQL TLS and Redis TLS to exercise production-like configuration. | The separate fresh migration and backup/restore test is recorded in `SWMS_PRODUCTION_HARDENING_REPORT.md`; it does not verify a separate team CI service. |
| Staging | Production-equivalent TLS, Redis, CORS, secrets, proxy, backups, logging, and hardware/test-device path; use staging-only credentials and data. | Not configured or independently verified in this repository audit. |
| Production | Production-only secrets and services, `DB_SSL_MODE=verify-full`, `rediss://`, HTTPS, reviewed migration and backup process. | Not accessed or verified. Do not infer production status from local test results. |

Before any release, record the environment identity, database server/version, migration status, TLS status, Redis availability, health-check result, and backup/restore evidence without printing secrets.

## 4. Database initialization and migrations

For an **empty database only**, apply the baseline schema first, then all incremental migrations in order. For an **existing SWMS database**, do not reapply the baseline; back it up and run only pending incremental migrations.

See [the PostgreSQL migration checklist](./swms-backend/docs/MIGRATION-POSTGRESQL.md) for prerequisites, exact order, status verification, and rollback limitations.

The production runbook must be rehearsed on a production-equivalent database before release. The migration runner uses a PostgreSQL advisory lock and each migration is transactional. There are no automatic down migrations.

## 5. Backup and recovery procedure

### Policy baseline

- Create a compressed PostgreSQL custom-format full backup daily; retain at least 35 daily copies, subject to approved legal retention requirements.
- Use managed point-in-time recovery/continuous WAL archiving where supported; a recommended operational target is at least 7 days of PITR history. Confirm the provider's actual RPO/RTO.
- Perform a restore drill monthly and after material schema changes.
- Store backups in a separate, access-controlled account/project. Require encryption at rest using a managed KMS key or approved client-side encryption; restrict decrypt and restore permissions to designated operators. Do not treat `pg_dump` compression as encryption.
- Keep backup credentials in the secret manager or an access-controlled `PGPASSFILE`, never in command-line arguments, logs, source control, or this guide.

### Full backup

Take backups from the intended environment using a PostgreSQL client compatible with the server:

```powershell
pg_dump --format=custom --no-owner --no-acl --file "$env:BACKUP_FILE" --dbname "$env:DB_NAME"
```

Run this on an encrypted ephemeral volume or pipe/store the output using the organization's approved KMS-backed encryption workflow. Verify the command exit code and archive size, calculate/store a checksum, upload to the restricted backup location, and remove temporary plaintext securely. `pg_dump` does not encrypt the archive by itself.

### Restore drill

Never restore over the source database. Create a separate empty test database and restore the archive into it:

```powershell
createdb --host "$env:DB_HOST" --port "$env:DB_PORT" --username "$env:DB_USER" "$env:RESTORE_TEST_DB"
pg_restore --exit-on-error --no-owner --no-acl --dbname "$env:RESTORE_TEST_DB" "$env:BACKUP_FILE"
```

For an encrypted archive, decrypt into a protected temporary location first. Then verify `schema_migrations`, expected table/index/trigger presence, representative row counts, application health, and role-scoped read/write smoke tests. Record source environment, backup timestamp/checksum, restore target, tool/server versions, duration, and verification results. Drop only the specifically created test database after evidence is recorded.

The repository includes an isolated recovery verification script that builds a fresh schema, applies every migration, inserts only a synthetic marker row, makes a PostgreSQL custom-format dump, restores it into a second uniquely named loopback database, verifies migration history and the marker, and removes only its own temporary databases/archive:

```powershell
$env:SWMS_RECOVERY_TEST_CONFIRM = "YES"
$env:PG_BIN_DIR = "C:\Program Files\PostgreSQL\18\bin"
node scripts\verifyDatabaseRecovery.js
Remove-Item Env:\SWMS_RECOVERY_TEST_CONFIRM
Remove-Item Env:\PG_BIN_DIR
```

Run it from `swms-backend` with a non-production loopback PostgreSQL instance and a role allowed to create/drop databases. It is not a production backup and does not verify provider-managed PITR or encryption-at-rest.

## 6. API, HTTPS, health, and graceful shutdown

- Terminate HTTPS at a trusted proxy/load balancer; forward the original protocol only through trusted hops. `GET /health` checks PostgreSQL with `SELECT 1`; it does not prove backup, Redis, migration, or hardware health.
- Device ingestion also rejects non-secure requests in production. Provision device credentials out-of-band and never place them in frontend code, URLs, logs, or shared public documents.
- Keep `/api-docs` disabled unless required.
- On `SIGTERM` or `SIGINT`, the API stops accepting requests, drains active HTTP work, then closes PostgreSQL and Redis. Allow 30 seconds before a supervisor force-kills the process.
- Monitor API latency/errors and 401/403/429/5xx rates, database pool errors and saturation, Redis errors, migration outcomes, job failures, disk/telemetry growth, backup completion, and restore-drill results.
- Centralize logs with access controls and redaction. Do not log bearer tokens, passwords, device credentials, database URLs, request bodies containing personal data, or secret environment values. Export audit records to immutable storage according to policy.

## 7. Pre-release checklist

- Verify production TLS to PostgreSQL (`verify-full`) and Redis (`rediss://`), proxy hop count, HTTPS redirect/termination, CORS allowlist, Swagger setting, and frontend API origin.
- Verify API, authentication, and device rate-limit thresholds with representative expected traffic, including multiple devices behind a gateway/NAT.
- Confirm migration status includes `011_gps_iot_devices.sql`; rehearse the release against a fresh database and a restored production-equivalent copy.
- Verify encrypted backup completion and a separate-target restore; document actual results.
- Test account scoping, collections, bins, reports/exports, device registration/credential rotation/revocation, duplicate ingestion, and offline behavior.
- Verify a real GPS tracker and real bin sensor end to end before claiming live operation. See the [GPS/IoT implementation requirements](./GPS_IOT_API_DOCUMENTATION.md).
- Run backend/frontend tests, security/integration suites, lint, production build, and dependency audits.
