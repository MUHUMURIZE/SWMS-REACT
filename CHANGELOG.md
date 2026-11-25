# Changelog

## 2026-11-24

### Audit corrections

- Corrected OpenAPI export path parameter schemas to string enums and documented CSV, XLSX, and PDF response media types.
- Validated report query IDs and location filters before database access.
- Restricted export resource lookup to the explicit allowlist, returning 404 for inherited object property names.
- Added RBAC, actual scheduling route reachability, OpenAPI, report validation/scoping, and export-format tests.
- Confirmed collector report 403 is intentional under current management-report policy; self metrics are available on the collector dashboard.
- Confirmed scheduling routes remain reachable through existing Express router fallthrough; no route order change was needed.
- Full suite: 58 passed, 0 failed.

### Operational features

- Added 80%, 90%, and 100% bin-fill notifications to household, collector, and representative recipients.
- Added bin-empty notifications after completed collections.
- Added district, sector, collector, and company reporting endpoints.
- Added top-district, top-company, bin-distribution, completion-rate, overdue, collector-performance, pickup, today, and fill-trend KPIs.
- Added upcoming, missed, overdue, and rescheduled collection scheduling endpoints.
- Added collection rescheduling timestamps and bin fill-history tracking.
- Added CSV, Excel, and PDF exports for companies, collectors, households, bins, and collections.

### Security

- Added `.gitignore` rules for environment, secret, dependency, log, and local runtime files.
- Added Helmet security headers.
- Added an environment-based CORS allowlist.
- Added login throttling keyed by IP and normalized email.
- Added JWT issuer, audience, algorithm, and expiry verification.
- Added strong-password validation for registration and password changes.
- Added expired revoked-token cleanup.
- Disabled Swagger in production unless explicitly enabled.
- Added audit log persistence and operational audit events.

### Database

- Added `audit_logs` with actor, action, resource, reason, IP, metadata, and timestamp.
- Added migration history and a migration runner.
- Added collection/collector consistency enforcement.
- Added collection state-transition enforcement.
- Added bin fill-level/status synchronization.
- Added status, role, hierarchy, collection, notification, and lookup indexes.
- Added delete safeguards for dependent organizational and operational records.

### API

- Added bounded pagination with `limit` and `offset`.
- Added dashboard missed, in-progress, overdue, and pending KPIs.
- Added pagination parameters to list operations in OpenAPI.
- Added stable mapping for PostgreSQL uniqueness, foreign-key, and check constraints.
- Added `cancelled` collection status.

### Testing

- Added security middleware and JWT tests.
- Added PostgreSQL integration coverage for hierarchy and bin invariants.
- Added live database testing for collection ownership consistency.
- Verified all 46 tests pass.

### Production workflow remediation

- **Issue found:** collection creation accepted terminal states, transition rules were not consistently database-enforced, and completion effects could partially persist or duplicate under concurrent requests.
- **Root cause:** lifecycle checks were incomplete and completion updates, bin emptying, notifications, and auditing ran outside a single locked transaction.
- **Fix applied:** limited initial states to `pending`/`scheduled`; added PostgreSQL insert/update transition enforcement; serialized completion with row locks and made bin emptying, household/collector/representative notifications, and audit writes atomic and idempotent.
- **Issue found:** per-process login throttling did not share limits across production instances.
- **Fix applied:** added Redis-backed production throttling, fail-closed startup without `REDIS_URL`, and configurable trusted proxy hops. Added `Content-Disposition` to CORS exposed headers.
- **OpenAPI:** added scheduling pagination, state-transition descriptions, realistic response examples, and configurable `API_SERVER_URL`.
- **Files modified:** collection controller/model, bin model, notification service, collection validation, schema and migration 007, login limiter, proxy config, auth routes, server, OpenAPI, environment example, README, Redis dependency manifests, and targeted tests.
- **Database changes:** migration 007 adds the collection initial-state and transition trigger; applied successfully to the configured local PostgreSQL database. No table or column changes.
- **Tests added:** valid/invalid initial and transition states; concurrent and repeated completion; atomic bin/notification/audit effects; transaction rollback; CORS exposure; production Redis requirement; OpenAPI examples and pagination.
- **Test results:** `npm test` 68 passed; `npm run test:security` 7 passed; `npm run test:integration` 1 passed. The three collection-workflow PostgreSQL tests passed as part of the full suite.
- **Deployment note:** production requires a provisioned Redis service and the correct `TRUST_PROXY_HOPS`; a live Redis connection was not exercised in this test environment.

