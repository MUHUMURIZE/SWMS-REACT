# SWMS Production Hardening Report

## Executive summary

**Status: NOT PRODUCTION READY.** PostgreSQL TLS enforcement, shared API/device rate limiting, graceful shutdown, and deployment/recovery documentation are implemented. The code and migration/restore paths passed the checks recorded below. However, the configured PostgreSQL connection is currently unencrypted, and no staging or production environment, automated backup service, Redis deployment, or real GPS/bin hardware has been verified.

No production database was accessed or modified. The recovery drill used only temporary loopback databases with synthetic data; it removed its databases and archive on completion. No commits or pushes were made.

## Critical blockers and priority

1. **Verify actual deployment configuration.** Configure and test production PostgreSQL TLS with `DB_SSL_MODE=verify-full`, TLS Redis (`REDIS_URL=rediss://...`), HTTPS termination, exact CORS origins, trusted proxy hops, production frontend API URL, and secret-manager values. No deployed environment was accessed.
2. **Configure and prove backups.** The daily backup/retention, encryption, access-control, and PITR policy in [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) is a documented recommendation, not an installed or verified backup service. Configure it and perform a restore from a real environment backup into a separate target.
3. **Run real-device acceptance tests.** No physical GPS tracker or bin sensor has sent data through this system. Do not claim live tracking or sensing until the end-to-end checks below pass.
4. **Verify environment separation.** Independently identify and verify CI/test, staging, and production databases, Redis instances, credentials, origins, backups, and migration state. Only the configured local loopback database and temporary local test databases were checked.
5. **Decide on MQTT based on selected hardware.** MQTT is not implemented. If a selected device cannot use the supported HTTPS REST endpoints, implement and security-test an appropriate broker and device/topic authorization before deployment.
6. **Close carried-over operational/security findings.** The earlier audit also identified missing privileged-user MFA, no verified centralized/immutable audit-log retention or production monitoring, and no telemetry-history retention/archival policy. These were not implemented or independently re-audited in this hardening phase; assess and address them before release.

## Changes implemented

- Added environment-configurable PostgreSQL TLS policy in [dbTls.js](./swms-backend/config/dbTls.js) and wired it into [db.js](./swms-backend/config/db.js). Production requires `DB_SSL_MODE=verify-full`; certificate and hostname verification remain enabled. An optional `DB_SSL_CA_FILE` supplies a trusted PEM CA. Local development defaults to TLS disabled.
- Added shared Redis-backed limits in [loginRateLimiter.js](./swms-backend/middleware/loginRateLimiter.js) and mounted them in [server.js](./swms-backend/server.js) and the GPS/IoT ingestion routes. Production requires `REDIS_URL` using `rediss://`; startup fails if Redis cannot connect, and requests fail closed on store errors. GPS/IoT ingestion is excluded from the general API limit and receives both a high per-IP guard and authenticated per-device limits.
- Added graceful shutdown for HTTP requests, PostgreSQL, and Redis, with a 30-second timeout.
- Updated [.env.example](./swms-backend/.env.example), the [backend README](./swms-backend/README.md), and [PostgreSQL migration instructions](./swms-backend/docs/MIGRATION-POSTGRESQL.md). Updated the [deployment guide](./PRODUCTION_DEPLOYMENT_GUIDE.md) with runtime variables, environment separation, rate limits, HTTPS/proxy/CORS, secrets, health checks, logging/monitoring guidance, backup/restore procedures, and a release checklist.
- Added an opt-in, loopback-only [recovery verification script](./swms-backend/scripts/verifyDatabaseRecovery.js). It initializes a new database from the baseline schema, applies incremental migrations, makes a PostgreSQL custom-format dump, restores it to a second isolated database, and checks migration history and a synthetic fixture.
- Marked the earlier [production-readiness audit](./SWMS_PRODUCTION_READINESS_REPORT.md) as a historical snapshot so it is not mistaken for the current assessment.

### Rate-limit defaults

| Scope | Default |
|---|---:|
| General API | 600 requests per IP per 15 minutes |
| `/api/auth` | 60 requests per IP per 15 minutes |
| Failed login attempts | 10 per IP/email per 15 minutes |
| GPS ingestion | 600 requests per authenticated device per minute |
| IoT ingestion | 120 requests per authenticated device per minute |
| Combined GPS/IoT ingestion IP guard | 12,000 requests per IP per minute |

Limits are configurable through the variables documented in the deployment guide. These are starting values, not load-tested production thresholds. Tune them against expected device rates and gateway/NAT sharing. Password recovery endpoints are not implemented. The API returns HTTP 429 when a configured limit is exceeded.

## Verification results

### PostgreSQL TLS

- **TLS configuration:** Focused tests confirm development defaults to TLS disabled, `verify-full` enables certificate verification, an optional CA is loaded, and production rejects missing/disabled TLS and invalid or empty CA configuration.
- **Encrypted-transport test:** Started an isolated temporary PostgreSQL TLS server using a test certificate with localhost SANs. A Node `pg` connection configured with `DB_SSL_MODE=verify-full` and that CA connected successfully; PostgreSQL reported an encrypted session using **TLS 1.3**.
- **Configured database:** PostgreSQL **18.2**, 10 migration records with `011_gps_iot_devices.sql` latest, but the inspected connection reported `connection_encrypted=false`. This is a local loopback database, not evidence about staging or production. The temporary TLS server and test certificate were removed.
- **Conclusion:** TLS implementation and a certificate/hostname-verified TLS connection were tested. The currently configured database is not using TLS, and production connectivity remains unverified.

### Database migration and backup/restore drill

Repeated `node scripts/verifyDatabaseRecovery.js` against the configured non-production loopback PostgreSQL instance:

```text
baselineSchemaApplied: true
migrationsApplied: 10
backupCreated: true
restoredDatabaseVerified: true
restoredMigrationCount: 10
syntheticFixtureVerified: true
backupFormat: PostgreSQL custom archive
```

The configured database ledger was separately read without changing it: 10 entries, latest `011_gps_iot_devices.sql`. The drill verified a fresh baseline-plus-migrations setup and restoration of a synthetic marker into a separate temporary database. It **does not** prove backup encryption, retention, access control, provider-managed PITR, restore of production data, or CI/staging/production migration state. The drill cleaned up its temporary databases and dump.

### Automated checks

| Check | Result |
|---|---|
| Backend `npm test` | **PASS — 104 passed, 0 failed, 0 skipped** |
| Backend `npm run test:security` | **PASS — 8 passed, 0 failed** |
| Backend `npm run test:integration` | **PASS — 1 passed, 0 failed** |
| Frontend `npm test` | **PASS — 3 test files, 6 tests passed** |
| Frontend `npm run lint` | **PASS with 1 warning** — `src/context/AuthContext.tsx:59` (`react(only-export-components)`); unrelated to the hardening changes |
| Frontend `npm run build` | **PASS — TypeScript and Vite production build completed** |
| Backend `npm audit --omit=dev` | **PASS — 0 vulnerabilities reported** |
| Frontend `npm audit --omit=dev` | **PASS — 0 vulnerabilities reported** |
| `git diff --check` | **PASS** |

These are local worktree checks. They do not establish production Redis availability, cross-instance rate-limit behavior against a deployed Redis service, production load capacity, or real network/device behavior.

## Environment verification

| Environment | Evidence and status |
|---|---|
| Configured local database | PostgreSQL 18.2 on loopback; migration ledger through 011. TLS is disabled for this connection. The database name was deliberately not included in this report; its intended environment label was not independently established. |
| Isolated test databases | Fresh baseline, all 10 migrations, custom-format backup, restore, and synthetic fixture were verified locally; temporary resources were removed. |
| Separate CI/test environment | **Not verified.** |
| Staging | **Not accessed or verified.** |
| Production | **Not accessed or verified.** No production data was modified. |
| Redis deployment | **Not configured or connected during this verification.** Production code requires TLS Redis and fails closed, but service availability and shared counters remain deployment checks. |

The repository does not include verified container, orchestration, cloud, reverse-proxy, or deployment manifests. Apply the documented controls in the actual deployment platform and record results per environment. Do not infer staging or production readiness from local tests.

## Classification

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| PostgreSQL TLS support and production enforcement | **READY** | `verify-full`, certificate verification, optional CA, and production fail-fast behavior implemented and tested. |
| TLS on the configured database | **NEEDS CONFIGURATION** | The inspected local connection is unencrypted. Configure TLS for each actual environment and verify it independently. |
| API, authentication, and device-ingestion rate-limit implementation | **READY** | Shared Redis-backed limiters, HTTP 429 handling, per-device keys, configurable quotas, and focused tests are present. |
| Production Redis service and shared-limit operation | **NEEDS CONFIGURATION** | Configure `rediss://` and verify authentication, connectivity, fail-closed behavior, and quotas across deployed API instances. |
| HTTPS, proxy trust, CORS, secrets, frontend API URL | **NEEDS CONFIGURATION** | Requirements are documented; actual staging/production values and routing were not tested. |
| Graceful shutdown code | **READY** | HTTP, PostgreSQL, and Redis shutdown handling with timeout is implemented. Orchestrator signal delivery and termination grace period need environment verification. |
| Deployment platform configuration | **NEEDS IMPLEMENTATION** | No deployment manifests or platform configuration are present in this repository. Add or configure these in the selected hosting platform and verify them before release. |
| Centralized monitoring, alerting, immutable audit-log retention, and telemetry retention/archival | **NEEDS CONFIGURATION / NEEDS IMPLEMENTATION** | The runbook gives monitoring and audit guidance, but no production sink, alert routing, retention policy, or tested archival process was verified. Define data retention and operational ownership. |
| Privileged-user MFA | **NEEDS IMPLEMENTATION / POLICY DECISION** | The earlier audit found no MFA. This hardening phase did not add it; decide the privileged-account policy and implement it if required by the deployment risk assessment. |
| Backup/restore procedure | **READY** | Procedure and isolated synthetic restore script are documented and passed locally. |
| Automated encrypted backups, retention, PITR, and real-environment restore | **NEEDS CONFIGURATION** | No operational backup service or production-equivalent restore evidence was available. |
| Baseline and migrations 002–011 documentation | **READY** | Ordered setup, existing-database procedure, status query, rollback limitations, and isolated test procedure are documented and tested on a fresh local database. |
| Migration state in the configured local database | **READY** | Ten migration entries are present through `011_gps_iot_devices.sql`. |
| CI/test, staging, and production separation | **NEEDS CONFIGURATION** | Separate environments and their migration/backup states were not independently verified. |
| GPS and IoT device operation | **NEEDS REAL-WORLD TESTING** | No physical tracker or sensor has successfully ingested data in this verification. |
| MQTT | **NEEDS IMPLEMENTATION if required by selected hardware** | Not configured or implemented; HTTPS REST is the current device transport. |
| Test suites, build, and dependency checks | **READY** | Exact local results are listed above; repeat in CI and for each release. |

## Hardware acceptance requirements

### Vehicle GPS

1. Obtain a real GPS tracker, compatible SIM, active data plan, and working vehicle network coverage.
2. Register the device using the authenticated management workflow, associate it with the correct vehicle, and provision its credential securely. Never put device credentials in frontend code, URLs, or logs.
3. Configure the tracker to send validated HTTPS requests to the production-equivalent ingestion endpoint at its expected reporting interval.
4. Confirm successful ingestion using the actual device's coordinates and timestamps; verify latest location, paginated history, vehicle association, and communication timestamp through authorized API reads.
5. Confirm the frontend shows the received location and status, then test loss/recovery of network and the configured online/offline transition. Do not substitute generated coordinates.

### Smart-bin sensor

1. Obtain a real fill-level sensor and establish which capabilities are physically supported: fill level, battery measurement, sensor-health reporting, and overflow detection are not assumed by the backend.
2. Register and securely provision the device, associate it to the correct bin, and calibrate the actual sensor against the bin and waste type.
3. Send real HTTPS telemetry; verify actual fill level, measured/received timestamps, history, latest status, threshold/overflow alerts, and device communication state through authorized API reads.
4. If battery or sensor-health fields are unsupported, leave them absent rather than fabricate values. Verify displayed values and offline/alert behavior in the frontend.
5. Test network loss/reconnection, duplicate delivery, clock skew, and sensor faults with the selected hardware.

No hardware results are claimed. If either device family requires MQTT rather than HTTPS, broker TLS, per-device authentication, topic authorization, payload validation, duplicate handling, reconnect behavior, credential rotation, and monitoring must be designed and tested first. Broker credentials must never be exposed to the frontend.

## Final recommendation

Keep the deployment classified as **NOT PRODUCTION READY** until production-equivalent database/Redis/HTTPS configuration is verified, an encrypted backup and separate-target restore from the actual environment are demonstrated, each environment's migration state is checked, and real GPS and bin devices pass the acceptance requirements. The successful local TLS, migration, restore, and automated-test results are useful implementation evidence, not substitutes for those operational and hardware checks.
