# SWMS Security Report

## Issue Found

The original audit identified secret exposure risk, missing `.gitignore`, weak login abuse protection, insufficient JWT lifecycle controls, unrestricted CORS, missing security headers, public Swagger, uncontrolled collection transitions, weak password policy, no audit trail, and unsafe cascade deletes.

## Root Cause

- Local `.env` configuration was not protected from source control.
- Authentication endpoints relied on bearer verification without rate limiting or environment binding.
- CORS used permissive defaults.
- Security middleware and Swagger environment controls were absent.
- Some critical workflows were enforced only in application code.
- Delete operations had no dependency guards or audit trail.

## Solution Applied

- Added repository ignore rules for `.env`, dependencies, logs, and local runtime artifacts.
- Added Helmet and a CORS origin allowlist.
- Added login throttling for IP/email combinations.
- Added strict JWT algorithm, issuer, audience, expiry, JTI, and token-version checks.
- Added strong passwords for account creation and password changes.
- Restricted Swagger in production unless explicitly enabled.
- Added audit log storage and audit calls for authentication and destructive/business operations.
- Added database triggers for collection ownership, collection transitions, and bin status.
- Added safe delete dependency checks and collection-state delete protection.

## Files Modified

- [.gitignore](/C:/Users/user/SWMS-REACT/.gitignore)
- [server.js](/C:/Users/user/SWMS-REACT/swms-backend/server.js)
- [authController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/authController.js)
- [authMiddleware.js](/C:/Users/user/SWMS-REACT/swms-backend/middleware/authMiddleware.js)
- [loginRateLimiter.js](/C:/Users/user/SWMS-REACT/swms-backend/middleware/loginRateLimiter.js)
- [validate.js](/C:/Users/user/SWMS-REACT/swms-backend/middleware/validate.js)
- [auditModel.js](/C:/Users/user/SWMS-REACT/swms-backend/models/auditModel.js)
- [004_security_and_integrity.sql](/C:/Users/user/SWMS-REACT/swms-backend/database/migrations/004_security_and_integrity.sql)

## Database Changes

- Added `audit_logs`.
- Added collection relationship and state-transition triggers.
- Added bin fill/status synchronization trigger.
- Added revoked-token expiry cleanup support.
- Added organizational and dashboard indexes.

## Tests Added

- Strong-password policy test.
- Pagination validation test.
- JWT issuer/audience/algorithm test.
- PostgreSQL constraint mapping test.
- Live PostgreSQL bin and collection ownership invariant test.

## Test Results

- 46 tests passed.
- Production dependency audit passed with zero vulnerabilities.

## Remaining security work

- Rotate every secret that was previously committed or shared.
- Deploy behind TLS and a reverse proxy.
- Provision Redis and set `REDIS_URL` for production; the API now refuses to start without shared throttling storage.
- Set `TRUST_PROXY_HOPS` to match the actual trusted proxy chain; forwarded client addresses must not be trusted directly from untrusted clients.
- Add MFA for administrators and optional privileged accounts.
- Ship audit logs to immutable external retention.

## Operational feature security

- Bin thresholds notify only the assigned household, collector, and representative.
- Collection completion notifications use the collection's household hierarchy.
- District and sector reports are limited to administrators.
- Collector and company reports are role-scoped for representatives and administrators.
- Collector and representative exports are filtered by their organization or assigned households.
- Household accounts cannot export system resources.
- Export actions are audit-logged with actor, format, resource, and row count.
- CSV values beginning with spreadsheet formula characters are prefixed to reduce formula-injection risk.

## Latest audit

### Issue Found

- Export resource path values used JavaScript prototype-chain lookup.
- Report query identifiers were coerced without safe-integer validation.
- Swagger declared export string path values as integers and omitted the file response content types.

### Root Cause

- Allowlist lookup did not require an own property.
- Report controller used unchecked `Number()` conversion.
- OpenAPI generation treated every path parameter as a numeric database ID.

### Fix Applied

- Export lookup now accepts only own properties in the resource allowlist.
- Report IDs require positive safe integers; district/sector filters require bounded scalar strings.
- OpenAPI documents export resource and format enums with matching binary MIME types.

### Files Changed

- [exportController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/exportController.js)
- [reportController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/reportController.js)
- [openapi.js](/C:/Users/user/SWMS-REACT/swms-backend/docs/openapi.js)

### Tests Added / Results

- Invalid export format/resource, report ID validation, company report ownership, and export OpenAPI contract tests.
- Full suite: 58 passed, 0 failed.

### False positive reviewed

Collector access to `/api/reports/collector` remains denied intentionally: it is a management report for administrators and company representatives. Collectors' own KPIs are available from `/api/dashboard/collector`. No privilege expansion was made.

## Production workflow remediation (2026-11-24)

### Issues found and root causes

- Collection creation accepted terminal statuses and state-transition enforcement was not consistent across update paths.
- Completion state, bin emptying, recipient notifications, and audit records were written in separate operations, allowing partial effects and races.
- Login limits were process-local and therefore ineffective as a shared production control.
- CORS did not expose download filenames; Swagger scheduling pagination and server URL configuration were incomplete.

### Fixes applied

- Restricted initial statuses to `pending` and `scheduled`; added PostgreSQL insert/update transition enforcement.
- Wrapped completion status, bin emptying, household/collector/representative notifications, and audit writes in a row-locked transaction. Concurrent/repeated completion requests do not repeat the effects, and audit failure rolls back the transaction.
- Added Redis-backed shared login throttling in production, fail-closed startup if `REDIS_URL` is absent, normalized-email/IP keys, and numeric `TRUST_PROXY_HOPS` validation.
- Exposed `Content-Disposition`; documented scheduling pagination and state transitions; added realistic examples and configurable `API_SERVER_URL`.

### Files changed

- `swms-backend/controllers/collectionController.js`
- `swms-backend/models/collectionModel.js`
- `swms-backend/models/binModel.js`
- `swms-backend/services/notificationService.js`
- `swms-backend/validation/schemas.js`
- `swms-backend/database/schema.sql`
- `swms-backend/database/migrations/007_collection_lifecycle_initial_status.sql`
- `swms-backend/middleware/loginRateLimiter.js`
- `swms-backend/config/proxy.js`
- `swms-backend/routes/authRoutes.js`
- `swms-backend/server.js`
- `swms-backend/docs/openapi.js`
- `swms-backend/.env.example`, `swms-backend/README.md`, and Redis dependency manifests
- `swms-backend/tests/collectionWorkflow.integration.test.js` and targeted security, middleware, route, and OpenAPI tests

### Database changes

Migration 007 adds the lifecycle trigger to existing databases, matching the baseline schema. It adds no tables or columns. Migration 007 was applied to the configured local PostgreSQL database.

### Tests added and results

- Initial-state/transition enforcement; concurrent and duplicate completion; bin and recipient-notification effects; audit count; audit-failure rollback.
- Production startup refusal without Redis, proxy hop validation, CORS filename exposure, and OpenAPI contract/examples.
- `npm test`: 68 passed, 0 failed.
- `npm run test:security`: 7 passed, 0 failed.
- `npm run test:integration`: 1 passed, 0 failed.
- The live Redis connection path was not exercised; production deployment remains conditional on a provisioned, reachable Redis service and correctly configured trusted proxies.

