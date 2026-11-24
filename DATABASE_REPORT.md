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

## Database Changes

- `audit_logs` table with indexed actor, resource, and timestamp fields.
- `schema_migrations` table.
- `cancelled` collection status.
- `collections_enforce_relationship` trigger.
- `collections_enforce_status_transition` trigger.
- `waste_bins_enforce_status` trigger.
- Composite and lookup indexes for collections, households, collectors, representatives, and revoked tokens.

## Tests Added

- Rolled-back PostgreSQL transaction creates a company, representative, collector, household, and bin.
- Verified bin status derives as `HIGH` from fill level 85.
- Verified mismatched collection collector ownership raises a database constraint error.
- Verified no integration fixture remains after rollback.

## Test Results

- Migration runner successfully applied migrations 002, 003, and 004.
- PostgreSQL integration test passed.
- Remaining database dependencies should be added to the CI database environment before deployment.

