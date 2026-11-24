# Changelog

## 2026-11-24

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

