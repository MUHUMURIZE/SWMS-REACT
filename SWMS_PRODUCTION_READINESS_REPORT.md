# SWMS Production Readiness Audit

> Historical audit snapshot: this report predates the production-hardening changes. For current implementation and validation results, see [SWMS_PRODUCTION_HARDENING_REPORT.md](./SWMS_PRODUCTION_HARDENING_REPORT.md).

## Executive summary

**Overall: NOT PRODUCTION READY.** The current codebase has working role-scoped business APIs, GPS/IoT REST ingestion, validation, transactional updates, and migration history. The configured database has all 10 incremental migrations recorded through `011_gps_iot_devices.sql`. Automated tests, frontend build, lint, and production dependency audits were run successfully as detailed below.

Production operation is not evidenced. There is no checked-in deployment configuration, no verified production-like infrastructure, and no physical GPS or smart-bin device has been verified. In addition, the PostgreSQL client does not configure TLS, rate limiting covers login only, and the production deployment guide does not describe bootstrapping an empty database or migration 011.

No production data was modified. Secret values were not read or included in this report. No commits or pushes were made.

## Critical blockers and priority actions

1. **Secure the production database connection — NEEDS IMPLEMENTATION / NEEDS CONFIGURATION.** [config/db.js](./swms-backend/config/db.js) does not configure PostgreSQL SSL or a CA certificate. Establish and verify TLS (or document an approved encrypted private tunnel) before production data is used.
2. **Define and verify the deployment — NEEDS CONFIGURATION.** No deployment manifests or infrastructure configuration were found. Verify TLS termination, `TRUST_PROXY_HOPS`, exact `CORS_ORIGINS`, production `JWT_SECRET`, Redis, and `VITE_API_BASE_URL` in the actual deployment environment.
3. **Add API/device-ingestion abuse controls — NEEDS IMPLEMENTATION.** The Redis-backed limiter protects login only. Device ingestion and other endpoints have no application-wide or per-device rate/volume limits.
4. **Verify real devices and connectivity — NEEDS REAL-WORLD TESTING.** Successfully provision and test each supported device type over production-equivalent HTTPS. Until then, live GPS and sensor operation is unverified.
5. **Correct and exercise the database release procedure — NEEDS IMPLEMENTATION.** The production guide says to run migrations but does not say to load the baseline schema for a new database; its checklist stops at migration 010. The backend README documents the required `database/schema.sql` then `npm run migrate` sequence. Reconcile these instructions, include migration 011, and rehearse upgrade and recovery on a production-equivalent database.
6. **Enable operational safeguards — NEEDS CONFIGURATION / NEEDS IMPLEMENTATION.** Configure encrypted backups, point-in-time recovery and restore drills, centralized/immutable audit-log retention, monitoring/alerting, and production log redaction. These services are recommendations in documentation, not configured in the repository.
7. **Decide on privileged-account MFA — NEEDS IMPLEMENTATION.** MFA is not present; the deployment guide itself identifies it as a production recommendation. Set an explicit policy and implement it for administrators and other privileged users before deployment if required by the operating risk.

## Classification key

- **READY** — implementation or evidence is present in the reviewed code and/or tests; this is not a claim that the production deployment is ready.
- **NEEDS CONFIGURATION** — implementation exists but a deployment/operator action or environment-specific proof is missing.
- **NEEDS IMPLEMENTATION** — a product or operational control is absent or incomplete.
- **NEEDS REAL-WORLD TESTING** — code paths exist, but hardware or production-equivalent behavior has not been demonstrated.

## Module and authorization review

| Area | Status | Evidence and remaining work |
|---|---|---|
| Authentication | **READY** | JWT verification pins HS256, issuer, and audience; tokens expire after one hour and are checked against token version and revoked-token records. Logout revokes a token; password changes invalidate outstanding tokens. Password hashes use bcrypt cost 12 and account creation enforces a strong-password rule. |
| Privileged authentication | **NEEDS IMPLEMENTATION** | No MFA or refresh-token flow is implemented. Access tokens are stored in browser `localStorage` by [api.ts](./swms-frontend/src/lib/api.ts), increasing impact if frontend script execution is compromised. |
| Companies, representatives, collectors, households | **READY** | Account creation is admin-protected; role-specific hierarchy values are checked server-side. Household, collector, and representative reads and mutations are scoped to identity/company/district as applicable. |
| Company/district isolation | **READY** | Active district agreements are checked in service queries and enforced for fleet assignment in PostgreSQL. Cross-company, collector, district, and household restrictions are present in routes/services and covered by tests. Households are excluded from private fleet/device-management routes. |
| Collections and scheduling | **READY** | Collection assignment and status invariants are guarded in application logic and database triggers. Completion is transactional with bin emptying, notifications, and audit writes; full tests exercise concurrency and rollback behavior. |
| Smart bins | **READY** | Bin ownership, status thresholds, full-bin queries, and fill-history storage are present. Household/bin relationships use foreign keys, uniqueness, and deferred constraints. |
| Fleet | **READY** | Company ownership, collector assignments, active-district authorization, assignment history, and maintenance constraints are implemented and covered by database integration tests. |
| Notifications | **READY** | Reads and mark-as-read operations are user-scoped. Collection and district workflows create notifications. IoT alerts, however, are computed by an alerts endpoint rather than delivered through push/email/SMS. |
| Reports and exports | **READY** | Report access is role-gated and company/collector-scoped; exports use an allowlist, role-specific queries, and audit entries. CSV output prefixes common formula-leading characters, but output should be hardened and tested against leading control/whitespace characters before relying on it for untrusted spreadsheet data. |

## Security audit

| Control | Status | Findings |
|---|---|---|
| JWT signing and verification | **READY** | HS256 is explicitly pinned; issuer/audience and expiry are checked by the JWT library. Database role/token-version and revocation checks occur on requests. Production startup enforces a minimum secret length, but secret quality, storage, and rotation remain operator responsibilities. |
| Device authentication | **READY** | Hardware uses a separate 256-bit random credential, stored as a SHA-256 hash, with one-time return, rotation, revocation, type checks, and HTTPS enforcement in production. Device records are locked and rechecked during ingestion. |
| Input validation | **READY** | Body schemas reject unknown keys and validate IDs, coordinates, telemetry ranges, enums, dates, and pagination. PostgreSQL constraints independently protect key invariants. |
| Rate limiting | **NEEDS IMPLEMENTATION** | Login has a 10-attempt/15-minute Redis-backed limiter. No equivalent global, export, or per-device ingestion limit is present. `express.json` is capped at 1 MB, but this is not a request-rate control. |
| Redis security and availability | **NEEDS CONFIGURATION** | Production startup requires Redis and fails closed if it cannot connect. The code accepts `REDIS_URL` without requiring TLS (`rediss://`) or documenting a deployment network policy. Configure authenticated, encrypted, private Redis access and verify reconnect behavior. |
| Trusted proxy | **NEEDS CONFIGURATION** | `TRUST_PROXY_HOPS` is validated as a non-negative integer and defaults to zero. Set it to the exact trusted proxy topology; a wrong value can make client-IP rate limits and `req.secure` unreliable. |
| CORS | **NEEDS CONFIGURATION** | Production requires a non-empty allowlist. Set exact frontend origins and test preflight behavior. Origin-less requests are allowed; CORS is not an authentication boundary and does not replace endpoint authorization. |
| HTTPS | **NEEDS CONFIGURATION** | The application expects TLS termination at a trusted proxy/load balancer; no such deployment is supplied. Device ingestion rejects requests Express considers insecure in production. Validate proxy TLS and forwarded-protocol handling. |
| PostgreSQL transport | **NEEDS IMPLEMENTATION** | [db.js](./swms-backend/config/db.js) creates `pg.Pool` without an `ssl` option or CA configuration. No encrypted tunnel or managed-service setting was verified. |
| Authorization and tenant boundaries | **READY** | Protected user routes apply authentication and role checks; login is intentionally public and hardware ingestion uses device credentials. Services derive company, collector, and household identity from the authenticated user rather than trusting client-supplied tenant identifiers. Admin access is system-wide; representatives, collectors, and households are scoped. |
| Audit logging | **NEEDS IMPLEMENTATION / NEEDS CONFIGURATION** | `audit_logs` and audited workflows exist, and selected writes are atomic with audit writes. There is no configured centralized immutable sink or retention policy, and the review did not establish complete coverage for every mutation. Export logs outside the application database and verify coverage/retention. |
| Sensitive-data handling | **NEEDS IMPLEMENTATION** | Browser access tokens are stored in `localStorage`. Server and pool errors are written to `console` without a structured redaction policy. Review deployment log access/retention and move browser authentication to a design that limits token exposure. |
| Dependency exposure | **READY** | `npm audit --omit=dev` reported zero vulnerabilities for both backend and frontend production dependencies at audit time. Re-run in CI/release pipelines. |

## Database and migration audit

| Requirement | Status | Findings |
|---|---|---|
| Schema relationships and constraints | **READY** | Reviewed baseline schema and migrations 002–011. Key foreign keys, uniqueness rules, status/range checks, and integrity triggers are present, including household-bin, collection, district-agreement, fleet, device, and telemetry constraints. |
| Indexes | **READY** | Domain indexes cover common company/status, collection scheduling, histories, device communication, GPS location, sensor time, and alert queries. Production query plans and growth behavior have not been measured. |
| Transaction handling | **READY** | `runTransaction` wraps business updates; GPS/IoT ingestion locks the device, handles duplicate IDs, updates communication timestamps, and commits atomically. Tests cover duplicate/conflicting messages, out-of-order telemetry, completion concurrency, and audit failure rollback. |
| Migration 011 status | **READY for the configured database only** | A read-only query found 10 recorded migrations, latest `011_gps_iot_devices.sql`. No production connection was used. Only the currently configured database could be checked; separate development, CI, or test database instances were not independently verified. |
| Migration rollout safety | **NEEDS CONFIGURATION** | Incremental migrations use transactions and the runner takes an advisory lock. The initial schema is a separate `database/schema.sql` baseline, not a numbered migration. Back up, rehearse baseline-plus-incremental setup and upgrades on a production-equivalent copy, and plan rollback/forward recovery before release. |
| Migration documentation | **NEEDS IMPLEMENTATION** | [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) verifies only 002–010 and omits the baseline-schema step required for an empty database. [README.md](./swms-backend/README.md) documents the baseline and `npm run migrate` sequence; make the production instructions consistent. |
| History growth and retention | **NEEDS IMPLEMENTATION** | GPS locations, sensor readings, bin-fill history, notifications, and audit rows have no demonstrated retention, partitioning, or archival policy. Define legal retention, storage/volume limits, and tested archival/deletion procedures. |

## GPS and IoT readiness

| Capability | Status | Findings |
|---|---|---|
| GPS registration, association, rotation, revocation | **READY** | Authenticated management APIs and company/collector scope checks exist. Credentials are only returned during registration/rotation and are not stored in frontend source. |
| GPS ingestion, latest location, history, status | **READY in code; NEEDS REAL-WORLD TESTING** | Device-authenticated REST ingestion validates coordinates and timestamps, deduplicates message IDs, and stores received/recorded timestamps. Latest, history, online/offline status, and authorized map-data endpoints are implemented. |
| GPS map presentation | **NEEDS IMPLEMENTATION** | The current [GPS screen](./swms-frontend/src/pages/GPSTrackingPage.tsx) displays authorized coordinates in a table; it does not render a geographic map. The frontend service exposes history calls, but the page does not provide a history view. |
| Smart-bin registration, association, rotation, revocation | **READY** | Authenticated management APIs and tenant scoping are implemented. |
| Telemetry ingestion and history | **READY in code; NEEDS REAL-WORLD TESTING** | Telemetry validates fill level, optional battery level, sensor status, optional overflow, message ID, and timestamp. Duplicate handling and newest-reading status updates are transactional. The API does not assert that a sensor actually supports optional fields. |
| Sensor display and alerts | **READY for polling API; NEEDS IMPLEMENTATION for proactive delivery** | The API returns latest readings, paginated history, fill/overflow/fault/offline alert types, and communication timestamps. The monitoring page primarily lists devices and current alerts; it does not show per-bin latest readings/battery or history and does not send push/email/SMS notifications. |
| Sensor capabilities | **NEEDS REAL-WORLD TESTING** | Battery and overflow values are optional software fields; actual support, calibration, health meanings, fill-level accuracy, and thresholds depend on selected hardware and have not been verified. |
| MQTT | **NEEDS CONFIGURATION if required by chosen devices** | MQTT is not implemented or configured. HTTPS REST is the supported transport. If selected hardware only supports MQTT, broker TLS, per-device authentication/topic ACLs, schema limits, duplicate handling, reconnect behavior, and credential rotation remain to be implemented and tested. |
| Physical device operation | **NEEDS REAL-WORLD TESTING** | No successful physical GPS or IoT device ingestion has been demonstrated. Do not represent the deployment as live until real devices (or an explicitly identified test device) send and verify data end to end. |

## Deployment, operations, and frontend

| Requirement | Status | Findings |
|---|---|---|
| Environment/secrets | **NEEDS CONFIGURATION** | `.env.example` contains placeholders, not production values. Use a secret manager for JWT, database, Redis, and bootstrap credentials; set production CORS, proxy, API URL, and device freshness explicitly. The local `.env` was not read. |
| Database availability and TLS | **NEEDS IMPLEMENTATION / NEEDS CONFIGURATION** | Pool errors are logged and `/health` checks PostgreSQL. There is no explicit PostgreSQL TLS setup, pool timeout policy, or shutdown lifecycle. |
| Redis | **NEEDS CONFIGURATION** | Redis is mandatory for production login limiting and prevents startup when unavailable. No production Redis instance or TLS configuration was verified. |
| Frontend API origin | **NEEDS CONFIGURATION** | [api.ts](./swms-frontend/src/lib/api.ts) falls back to `http://localhost:3000` when `VITE_API_BASE_URL` is unset. Set and validate the production API origin during the frontend build; a successful build alone does not prove correct deployment routing. |
| Backups and recovery | **NEEDS CONFIGURATION** | The deployment guide recommends encrypted daily backups, point-in-time recovery, and restore drills, but none are configured or evidenced in the repository. |
| Logging and monitoring | **NEEDS CONFIGURATION / NEEDS IMPLEMENTATION** | `/health`, console error output, and background-job error logging exist. No deployment monitoring, metrics, alert routing, centralized logging, or demonstrated immutable audit export is configured. |
| Deployment artifacts | **NEEDS CONFIGURATION** | No container, orchestration, reverse-proxy, or cloud deployment manifests were found in the repository. |
| Offline/error/loading UX | **READY** | GPS and smart-bin pages include loading, empty, error, and explicit status/last-communication states. They use real API responses and do not synthesize locations or sensor readings. |

## Validation results

Executed against the current worktree:

| Check | Result |
|---|---|
| Backend `npm test` | **PASS — 98 passed, 0 failed, 0 skipped** |
| Backend `npm run test:security` | **PASS — 7 passed, 0 failed** |
| Backend `npm run test:integration` | **PASS — 1 passed, 0 failed** |
| Frontend `npm test` | **PASS — 3 test files, 6 tests passed** |
| Frontend `npm run build` | **PASS — TypeScript build and Vite production build completed** |
| Frontend `npm run lint` | **PASS with 1 warning** — `src/context/AuthContext.tsx:59` (`react(only-export-components)`); that file was not part of the GPS/IoT work. |
| Backend `npm audit --omit=dev` | **PASS — 0 vulnerabilities reported** |
| Frontend `npm audit --omit=dev` | **PASS — 0 vulnerabilities reported** |
| Migration status | **PASS for configured database** — 10 migrations recorded; latest is `011_gps_iot_devices.sql`. No migration was run during this audit. |

Automated results do not replace production-like deployment, security-configuration, backup-restore, or hardware tests. The standalone integration command covers one rolled-back database-invariant test; other collection/fleet database integration checks ran as part of the full backend suite.

## Recommended next steps

1. Configure PostgreSQL TLS/CA verification (or a reviewed encrypted tunnel), Redis TLS/private access, proxy hops, production CORS, and the production frontend API origin.
2. Add global and device-specific rate/volume controls, MFA policy for privileged users, and reviewed logging redaction.
3. Reconcile the production migration checklist with the README: initialize a blank database from `database/schema.sql`, apply migrations through 011, back up first, and rehearse both new-database and upgrade paths on a production-equivalent copy.
4. Configure database backup/PITR, perform and document a restore drill, and set retention/archival limits for telemetry and audit history.
5. Verify centralized monitoring, alert routing, process shutdown behavior, and production health/readiness probes.
6. Test company, district, collector, and household access with deployment identities; verify API abuse controls, TLS, token revocation, and exports.
7. Provision real GPS and bin devices, securely deliver credentials, and verify ingestion, duplicates, timestamp handling, offline transitions, sensor capabilities, and alert workflows end to end. Add MQTT only if required by the selected devices.
8. Complete UI requirements as needed: geographic map rendering, GPS/IoT history and per-bin telemetry, and proactive alert delivery.
