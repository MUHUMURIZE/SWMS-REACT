# SWMS Database Structure Report

**Inspection date:** 2026-11-24
**Database:** PostgreSQL, inspected through a read-only transaction against the database configured by the backend environment. No schema or data changes were made by the inspection.

## Tables and relationships

| Table | Purpose and key relationships |
|---|---|
| `companies` | Company identity and district/sector/cell/village. Unique company name. |
| `users` | Login identity, unique email, bcrypt `password_hash`, `user_role`, phone, token version. |
| `representatives` | Profile linked uniquely to a user and to one company; unique company index enforces at most one representative per company. |
| `collectors` | Profile linked uniquely to a user and to one representative. |
| `households` | Profile linked uniquely to a user and to one collector; holds address/national ID/location. |
| `waste_bins` | One bin per household, unique bin code, capacity, fill level, and derived status. |
| `collections` | Scheduled work references a household, collector, creator, status, timestamps, and notes. |
| `notifications` | User-owned notification content, priority/category, related resource, and read timestamp. |
| `audit_logs` | Actor, action/resource identifiers, reason, IP, JSONB metadata, and timestamp. |
| `revoked_tokens` | JWT ID primary key, owning user, and expiry for logout revocation. |
| `bin_fill_history` | Time-series fill level/status records linked to bins. |
| `schema_migrations` | Applied migration filenames and timestamps. |

Hierarchy:

```text
companies -> representatives -> collectors -> households -> waste_bins
                                              \-> collections <-/
users -> role-specific profile / notifications / audit actor / revoked tokens
waste_bins -> bin_fill_history
```

`collections` also has a database trigger requiring the assigned collector to match the household's collector. User/profile role correspondence is enforced by application account creation, not by a cross-table database constraint.

## Types, constraints, and indexes

- Enums: `user_role` (`ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR`, `HOUSEHOLD`); `collection_status` (`pending`, `scheduled`, `in_progress`, `collected`, `completed`, `missed`, `cancelled`); `bin_status` (`EMPTY`, `LOW`, `MEDIUM`, `HIGH`, `FULL`, `MAINTENANCE`).
- Primary keys use serial/bigserial identifiers. Profile `user_id` foreign keys are unique and cascade on user deletion.
- Company deletion is restricted while a representative exists. Representative/collector/household relationships have cascading foreign keys, so direct database deletion can remove descendants.
- Each household has a unique bin foreign key. A deferred constraint trigger requires each committed household to retain a bin; the unique constraint prevents a second bin.
- Bin capacity must be positive; fill level must be 0–100. A trigger derives status from fill level, except `MAINTENANCE`.
- Collection foreign keys and a trigger protect household/collector assignment. A trigger constrains status transitions on updates.
- Indexes support user role, profile ownership, collection household/collector/date/status, bin status, notifications, audit history, revoked-token expiry, and bin fill history.
- The inspected public schema had 39 indexes, of which 19 were unique.

## Migration and initialization

`database/schema.sql` establishes the baseline and currently includes the operational schema. The migration runner creates/uses `schema_migrations` and applies sorted `database/migrations/*.sql`; it does **not** create the baseline tables itself. A fresh database must receive `schema.sql` before `npm run migrate`.

The inspected database recorded:

- `002_household_exactly_one_bin.sql`
- `003_add_location_fields.sql`
- `004_security_and_integrity.sql`
- `005_operational_features.sql`
- `006_bin_fill_history.sql`

There is no `001` migration; the initial schema is provisioned separately. `schema.sql` and later migration files contain overlapping feature definitions, so provisioning and migration-history procedures should remain explicit and be tested on a clean disposable database before deployment.

## Data integrity snapshot

Read-only checks on the configured inspection database found:

| Check | Result |
|---|---:|
| User/profile role mismatches | 0 |
| Households without exactly one bin | 0 |
| Collection/household collector assignment mismatches | 0 |
| Bin status/fill-level mismatches (excluding maintenance) | 0 |
| Duplicate company representative groups | 0 |
| Duplicate profile user groups | 0 |
| Case-insensitive duplicate email groups | 0 |

The integration test also inserted related records in a transaction, verified bin status derivation and collection assignment rejection, and rolled back. These findings describe only the configured local database snapshot, not any separate production database.

## Findings

### Medium — collection status creation bypasses transition rules

**Problem:** The database transition trigger applies to updates, while `POST /api/collections` accepts every enum status. A collection can therefore be inserted directly as `completed` or another terminal state. The normal completion side effects are only in the controller update paths.

**Impact:** Database state and operational effects can diverge (for example a completed collection with a non-empty bin and no completion notification).

**Recommendation:** Validate the allowed initial status and make completion handling transactional and idempotent. No schema change was made in this audit.

### Medium — application-only profile-role invariant

**Problem:** The database ensures profile/user foreign-key integrity but does not ensure the user's role matches the profile table. The API's `createAccount` service creates the correct pairing.

**Impact:** Manual/imported SQL can create accounts with missing or mismatched profiles and cause authenticated requests to return profile-not-found errors.

**Recommendation:** Keep imports behind validation and add a pre-deployment invariant query; consider a database-level design only if direct database writes are part of the supported operating model.

### Medium — audit/event side effects span separate transactions

Some mutations commit before their audit or notification insert. A later insert failure can leave business state committed while the HTTP response is an error. This is an application transaction boundary, not a missing foreign key.

## Conclusion

The inspected schema has sound relational foundations, useful ownership indexes, and database-enforced bin and collection-assignment invariants. No data anomalies were observed in the configured inspection database. The collection initial-status gap and baseline/migration sequencing need attention before production operations; no migration is recommended without an agreed fix design.
