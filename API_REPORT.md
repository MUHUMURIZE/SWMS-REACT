# SWMS API Report

## Issue Found

The API lacked bounded list pagination, strict password documentation, cancellation status documentation, pagination parameters in Swagger, production Swagger controls, and consistent constraint HTTP mapping.

## Root Cause

- List models returned unbounded arrays.
- OpenAPI was generated from route and validation metadata but did not yet document pagination.
- PostgreSQL constraint classes were not mapped consistently.
- Production environment controls were not applied to Swagger or CORS.

## Solution Applied

- Added pagination middleware with default limit 50 and maximum limit 200.
- Applied pagination to companies, representatives, collectors, households, bins, collections, and notifications.
- Updated list models and controllers.
- Added strong-password OpenAPI schemas.
- Added `cancelled` collection status to validation and generated documentation.
- Added `limit` and `offset` query parameters to list operations.
- Added Swagger production enablement control.
- Added Helmet and CORS allowlist behavior.
- Added 400/409 mappings for database check, foreign-key, and uniqueness errors.
- Added smart notification metadata and notification workflows.
- Added role-scoped district, sector, collector, and company reports.
- Added upcoming, missed, overdue, and rescheduled collection endpoints.
- Added CSV, Excel, and PDF exports for five resource types.
- Added Reports, Scheduling, and Exports Swagger tags and route operations.

## Files Modified

- [pagination.js](/C:/Users/user/SWMS-REACT/swms-backend/middleware/pagination.js)
- [server.js](/C:/Users/user/SWMS-REACT/swms-backend/server.js)
- [openapi.js](/C:/Users/user/SWMS-REACT/swms-backend/docs/openapi.js)
- [validation/schemas.js](/C:/Users/user/SWMS-REACT/swms-backend/validation/schemas.js)
- List routes and list models for organizational and operational resources.
- [reportRoutes.js](/C:/Users/user/SWMS-REACT/swms-backend/routes/reportRoutes.js)
- [schedulingRoutes.js](/C:/Users/user/SWMS-REACT/swms-backend/routes/schedulingRoutes.js)
- [exportRoutes.js](/C:/Users/user/SWMS-REACT/swms-backend/routes/exportRoutes.js)
- [notificationService.js](/C:/Users/user/SWMS-REACT/swms-backend/services/notificationService.js)
- [reportModel.js](/C:/Users/user/SWMS-REACT/swms-backend/models/reportModel.js)
- [exportController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/exportController.js)

## Database Changes

- No API-only pagination data changes.
- OpenAPI status changes reflect the `cancelled` collection enum.
- Notification metadata and collection reschedule fields are database-backed.
- Bin fill-history data powers household trend analytics.

## Tests Added

- Pagination range rejection test.
- JWT and constraint mapping tests.
- OpenAPI route-parity and schema tests remain active.
- Bin threshold notification boundary test.
- CSV formula-safe escaping test.
- District report metric test.
- Scheduling mode test.

## Test Results

- 50 tests passed.
- OpenAPI route coverage passed.
- Production dependency audit passed.

## Remaining API work

- Add cursor or keyset pagination if datasets grow beyond the bounded-offset workload.
- Add response pagination metadata or a next-page link contract.
- Add API versioning before a breaking public contract is introduced.
- Integrate distributed throttling and centralized API monitoring for scaled deployments.

## Latest audit

### Issue Found

- Swagger described export `resource` and `format` parameters as integers and described file downloads as JSON.
- Malformed report IDs could reach PostgreSQL without validation.
- Invalid export resource names matching inherited object properties could yield a server error.

### Root Cause

- Generic path parameter generation assumed integer identifiers.
- Report controller converted arbitrary query values using `Number()`.
- Export allowlist lookup used inherited properties.

### Fix Applied

- Export path parameters now use string enums for the five resources and three formats; file MIME types and response schemas match runtime output.
- Report IDs use positive safe-integer validation; district/sector filters use bounded scalar validation.
- Export resources are accepted only from own allowlist properties.

### Files Changed

- [openapi.js](/C:/Users/user/SWMS-REACT/swms-backend/docs/openapi.js)
- [reportController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/reportController.js)
- [exportController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/exportController.js)
- [openapi.test.js](/C:/Users/user/SWMS-REACT/swms-backend/tests/openapi.test.js)
- [operational.test.js](/C:/Users/user/SWMS-REACT/swms-backend/tests/operational.test.js)
- [export.test.js](/C:/Users/user/SWMS-REACT/swms-backend/tests/export.test.js)
- [routes.test.js](/C:/Users/user/SWMS-REACT/swms-backend/tests/routes.test.js)
- [middleware.test.js](/C:/Users/user/SWMS-REACT/swms-backend/tests/middleware.test.js)

### Tests Added / Results

- Export endpoint tests exercise CSV, XLSX, PDF, invalid formats, and invalid resource names.
- Report tests cover invalid IDs and company representative scoping.
- Route test confirms scheduling endpoint reachability through Express router fallthrough.
- Full suite: 58 passed, 0 failed.

### False positives

- Collector report 403 is consistent with the management-only route guard; collector self metrics are available in the collector dashboard.
- Scheduling route mount order does not make the endpoint unreachable; verified with an authenticated HTTP request. No server route change was necessary.

## Production workflow remediation (2026-11-24)

### Issue Found

- Collection create/update paths did not consistently restrict initial states or enforce the full transition lifecycle.
- Collection completion effects could be duplicated or partially applied under concurrent requests or failures.
- Scheduling pagination, response examples, configurable OpenAPI server URL, and browser access to exported filenames were incomplete.

### Root Cause

- State validation did not cover all database write paths; completion side effects were outside one locked transaction.
- OpenAPI generation lacked scheduling query parameters and realistic response examples; CORS omitted the download filename header.

### Fix Applied

- Initial collection status is limited to `pending`/`scheduled`; subsequent transitions are described in OpenAPI and enforced by PostgreSQL and the collection update path.
- Completion updates lock the collection and bin and atomically perform bin emptying, notifications, and audit writes; repeated/concurrent completion does not duplicate side effects.
- Added `limit`/`offset` to scheduling operations, realistic collection/report/dashboard examples, configurable `API_SERVER_URL`, and `Content-Disposition` in CORS exposed headers.
- Production login throttling now uses shared Redis storage; startup requires `REDIS_URL`.

### Files Changed

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
- `swms-backend/tests/collectionWorkflow.integration.test.js` and targeted route, middleware, security, and OpenAPI tests

### Database Changes

Migration 007 enforces initial collection statuses and lifecycle transitions on existing installations. No table or column changes were introduced; migration 007 was applied to the configured local database.

### Tests Added / Results

- PostgreSQL tests cover valid/invalid initial states and transitions, concurrent/repeated completion, bin emptying, three completion-recipient notifications, a single audit entry, and rollback on audit failure.
- OpenAPI tests cover scheduling pagination, lifecycle schema/description, realistic list/detail examples, profile response shape, and configurable server URL.
- CORS and production Redis-required behavior are covered.
- `npm test`: 68 passed; `npm run test:security`: 7 passed; `npm run test:integration`: 1 passed.
- Live Redis connectivity was not exercised; production deployment requires provisioning Redis and configuring the trusted proxy hop count.
