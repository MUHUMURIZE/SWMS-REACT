# SWMS Project Status

Status date: 2026-11-24

## Overall status

The SWMS backend is substantially production-hardened. Existing authentication, authorization, organization, household, bin, collection, notification, dashboard, and Swagger workflows remain available.

Operational extensions now include threshold notifications, district/sector/collector/company reports, role analytics, collection scheduling intelligence, fill-history analytics, and CSV/Excel/PDF exports.

## Production-ready improvements

| Status | Area | Summary |
|---|---|---|
| Fixed | Credential protection | `.env` files are ignored; secret templates use placeholders; secret-backed startup validation was added. |
| Fixed | Login abuse | Login throttling uses Redis-backed shared storage in production, keys by normalized email and client IP, and refuses production startup without `REDIS_URL`. |
| Fixed | JWT lifecycle | HS256, issuer, audience, expiry, token-version, and revoked-JTI checks are enforced. Expired revoked tokens are cleaned hourly. |
| Fixed | CORS | Environment allowlists, explicit methods/headers, `Content-Disposition` exposure, Helmet security headers, and production startup checks were added. |
| Fixed | Swagger | Swagger can be disabled in production; route/schema parity, scheduling pagination, realistic examples, and configurable server URL remain tested. |
| Fixed | Collections | Initial states and valid transitions are enforced in the API and PostgreSQL; completion effects are locked, atomic, and idempotent. |
| Fixed | Waste bins | Database fill-level/status synchronization and exactly-one-bin constraints are enforced. |
| Fixed | Pagination | List endpoints support bounded `limit` and `offset` parameters. |
| Fixed | Dashboards | Admin, company, collector, and household dashboards now expose in-progress, missed, pending, overdue, and completion KPIs. |
| Fixed | Audit logging | `audit_logs` and audit recording support privileged and operational actions. |
| Fixed | Migrations | A migration history table and ordered migration runner were added. |
| Fixed | Error mapping | Duplicate, foreign-key, and check constraints map to stable 409/400 responses. |
| Fixed | Password policy | New accounts and password changes require 12-128 characters with character diversity. |
| Fixed | Delete safety | Cascade-heavy deletes now block dependent households, collectors, representatives, and active collection histories. |
| Fixed | Dependencies | Production dependencies currently report zero known npm audit vulnerabilities. |

## Deployment dependencies and deferred decisions

- Redis must be provisioned and `REDIS_URL` configured before production startup. The configured live Redis connection was not exercised in this test environment.
- Set `TRUST_PROXY_HOPS` to the actual trusted reverse-proxy hop count; the default is `0`.
- MFA for privileged roles: requires business and identity-provider decisions.
- Centralized log shipping/SIEM integration: audit records exist in PostgreSQL, but external immutable retention is deployment-dependent.
- Soft deletion and archival: blocked-delete rules are currently used; soft-delete semantics require a business retention decision.

## Requires business decision

- Retention period for audit logs and deleted operational records.
- Whether organizational reassignment may move existing descendants across companies.
- Whether a company representative may update a representative/company hierarchy beyond the currently enforced ownership rules.
- Production domains for CORS and Swagger exposure.

## Test status

- Previous audit baseline: 58 passing, 0 failing
- Current full suite: 68 passing, 0 failing
- Unit tests: passing
- OpenAPI coverage tests: passing
- Security suite: 7 passing
- PostgreSQL integration suite: 1 passing
- Collection workflow PostgreSQL tests: 3 passing (included in the full suite)
- Production dependency audit: zero findings

## Latest audit (2026-11-24)

### Confirmed issues fixed

| Issue Found | Root Cause | Fix Applied | Files Changed | Tests Added |
|---|---|---|---|---|
| Export path parameters showed as integers and successful exports as JSON. | OpenAPI inferred every path placeholder as a numeric ID and used the default JSON response. | Documented resource/format string enums, allowed values, binary MIME types, and export roles. | `swms-backend/docs/openapi.js` | OpenAPI export contract test |
| Malformed report query IDs could reach PostgreSQL and become server errors. | Report controller coerced arbitrary query values with `Number()` without validation. | Enforced positive safe integer IDs and bounded scalar district/sector strings. | `swms-backend/controllers/reportController.js` | Invalid report query and representative scoping tests |
| Inherited property names were accepted as export resources. | Resource lookup used prototype-chain property access on a normal object. | Restricted resource lookups to own allowlist keys. | `swms-backend/controllers/exportController.js` | Unsupported format/resource tests |

### Reviewed, not defects

- Collector `403` on `/api/reports/collector` is intentional: this endpoint supports administrators and company representatives reviewing a selected collector. Collectors receive their own metrics through `/api/dashboard/collector`; the report endpoint does not expose a collector-selected ID to collectors.
- Scheduling routes are reachable despite being mounted after `/api/collections`: the collection router's exact `/:id` route does not match the two-segment scheduling suffix and falls through to the next mounted router. A valid-token HTTP test confirms this. Mount order was left unchanged.

### Verification

- Full test suite: 58 passing, 0 failing.
- Added RBAC, OpenAPI, report ownership/validation, scheduling route, and CSV/XLSX/PDF export checks.
- Database schema and migrations unchanged by this audit.

## Production workflow remediation (2026-11-24)

| Issue Found | Root Cause | Fix Applied | Database Changes | Tests / Results |
|---|---|---|---|---|
| Terminal initial collection states and inconsistent transitions were possible. | Initial-state validation was broad and state transitions were not enforced for every write path. | Limit initial states to `pending`/`scheduled`; enforce allowed transitions in PostgreSQL and API validation. | Added migration 007 and matching baseline schema trigger; migration applied locally. | Added initial-state and transition integration coverage; passed. |
| Concurrent/repeated completion could leave partial or duplicate side effects. | Completion, bin emptying, notifications, and audit writes were not one locked transaction. | Lock collection/bin rows; make completion effects atomic and skip duplicate side effects after completion. | No tables or columns added. | Concurrent/repeated completion and audit-failure rollback tests passed. |
| Production throttling was process-local; downloads hid filenames from browser JavaScript. | No shared rate-limit store; CORS did not expose the download header. | Add Redis-backed production throttling, fail closed without Redis, configurable proxy hops, and expose `Content-Disposition`. | None. | Production Redis requirement, proxy validation, and CORS tests passed; live Redis connectivity remains unverified. |
| Scheduling/OpenAPI examples were incomplete or inaccurate. | Scheduling pagination and useful response examples/server configuration were missing. | Document pagination and transitions, use representative examples, and configure the server URL with `API_SERVER_URL`. | None. | OpenAPI contract and example tests passed. |

Files changed include collection lifecycle/transaction code, bin and notification models, auth throttling and proxy configuration, server/CORS setup, OpenAPI generation, migration/schema, environment and README documentation, Redis dependencies, and focused tests.

Verification: `npm test` 68 passed; `npm run test:security` 7 passed; `npm run test:integration` 1 passed. Deployment is conditional on provisioning Redis and setting the correct proxy hop count.

