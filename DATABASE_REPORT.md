# SWMS Database Report

## Issue Found

The original database lacked an enforceable collection owner relationship, collection state machine, fill-level/status consistency, migration history, audit storage, some key indexes, and safe dependency handling.

## Root Cause

- Key workflows depended primarily on application queries.
- The schema stored collection and bin state independently.
- Deletion behavior relied heavily on cascades.
- SQL migrations had no central application history.

## Solution Applied

- Added migration history and an ordered migration runner.
- Added an audit log table.
- Added database triggers for collection ownership and status transitions.
- Added a bin fill/status trigger.
- Added indexes for operational list and dashboard queries.
- Added delete dependency guards in the application.
- Added constraint error mapping for API responses.

## Files Modified

- [schema.sql](/C:/Users/user/SWMS-REACT/swms-backend/database/schema.sql)
- [002_household_exactly_one_bin.sql](/C:/Users/user/SWMS-REACT/swms-backend/database/migrations/002_household_exactly_one_bin.sql)
- [004_security_and_integrity.sql](/C:/Users/user/SWMS-REACT/swms-backend/database/migrations/004_security_and_integrity.sql)
- [migrate.js](/C:/Users/user/SWMS-REACT/swms-backend/scripts/migrate.js)
- [005_operational_features.sql](/C:/Users/user/SWMS-REACT/swms-backend/database/migrations/005_operational_features.sql)
- [006_bin_fill_history.sql](/C:/Users/user/SWMS-REACT/swms-backend/database/migrations/006_bin_fill_history.sql)

## Database Changes

- `audit_logs` table with indexed actor, resource, and timestamp fields.
- `schema_migrations` table.
- `cancelled` collection status.
- `collections_enforce_relationship` trigger.
- `collections_enforce_status_transition` trigger.
- `waste_bins_enforce_status` trigger.
- Composite and lookup indexes for collections, households, collectors, representatives, and revoked tokens.
- Notification category, priority, resource, and recipient metadata.
- Collection `original_scheduled_at` and `rescheduled_at` fields.
- `bin_fill_history` table with bin/time index.
- Fill-history trigger records every insert or fill-level change.
- Rescheduling and notification indexes.

## Tests Added

- Rolled-back PostgreSQL transaction creates a company, representative, collector, household, and bin.
- Verified bin status derives as `HIGH` from fill level 85.
- Verified mismatched collection collector ownership raises a database constraint error.
- Verified no integration fixture remains after rollback.

## Test Results

- Migration runner successfully applied migrations 002 through 006.
- PostgreSQL integration test passed.
- Remaining database dependencies should be added to the CI database environment before deployment.

## Latest audit

### Issue Found / Root Cause

No confirmed schema, migration, or database-integrity defect was found in the audited reports, scheduling, and export paths.

### Fix Applied / Database Changes

No database changes were required. Report query input validation now rejects malformed IDs before reaching PostgreSQL.

### Files Changed

- No schema or migration files changed during this audit.
- [reportController.js](/C:/Users/user/SWMS-REACT/swms-backend/controllers/reportController.js) validates query inputs.

### Tests Added / Results

- Added malformed report ID and company representative ownership tests.
- PostgreSQL integration test and full suite passed (58 passed, 0 failed).

## Production workflow remediation (2026-11-24)

### Issue Found

Collection status constraints did not reject terminal initial states at the database boundary, and concurrent collection completion could leave collection, bin, notification, and audit data inconsistent.

### Root Cause

The database transition trigger did not constrain initial insert states; completion side effects were not coordinated under one transaction and row lock.

### Fix Applied

- Added migration 007 and matching baseline schema trigger rules: new collections start as `pending` or `scheduled`; permitted transitions and terminal-state protection are enforced on updates.
- Completion now locks the collection and household bin and commits status, bin emptying, recipient notifications, and audit records atomically. Duplicate completion requests do not repeat effects.
- No new tables, columns, indexes, or foreign keys were required.

### Files Changed

- `swms-backend/database/schema.sql`
- `swms-backend/database/migrations/007_collection_lifecycle_initial_status.sql`
- `swms-backend/models/collectionModel.js`
- `swms-backend/models/binModel.js`
- `swms-backend/services/notificationService.js`
- `swms-backend/controllers/collectionController.js`
- `swms-backend/tests/collectionWorkflow.integration.test.js`

### Database Changes

Migration 007 was applied successfully to the configured local PostgreSQL database. The migration replaces the collection lifecycle trigger without modifying existing table structure.

### Tests Added / Results

- PostgreSQL integration coverage verifies valid/invalid initial states and transitions, concurrent and repeated completion, exactly one completion notification for each of the three recipients, a single audit record, bin emptying, and rollback when audit storage fails.
- `npm test`: 68 passed; `npm run test:integration`: 1 passed. The three collection-workflow integration tests also passed within the full suite.

