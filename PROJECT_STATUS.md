# SWMS Project Status

Status date: 2026-11-24

## Overall status

The SWMS backend is substantially production-hardened. Existing authentication, authorization, organization, household, bin, collection, notification, dashboard, and Swagger workflows remain available.

## Production-ready improvements

| Status | Area | Summary |
|---|---|---|
| Fixed | Credential protection | `.env` files are ignored; secret templates use placeholders; secret-backed startup validation was added. |
| Fixed | Login abuse | Per-IP and per-email login throttling was added with failed-request limiting and successful-request exemption. |
| Fixed | JWT lifecycle | HS256, issuer, audience, expiry, token-version, and revoked-JTI checks are enforced. Expired revoked tokens are cleaned hourly. |
| Fixed | CORS | Environment allowlists, explicit methods/headers, Helmet security headers, and production startup checks were added. |
| Fixed | Swagger | Swagger can be disabled in production; route and schema parity remain tested. |
| Fixed | Collections | State-transition validation, household/collector relationship trigger, cancellation state, and delete protection were added. |
| Fixed | Waste bins | Database fill-level/status synchronization and exactly-one-bin constraints are enforced. |
| Fixed | Pagination | List endpoints support bounded `limit` and `offset` parameters. |
| Fixed | Dashboards | Admin, company, collector, and household dashboards now expose in-progress, missed, pending, overdue, and completion KPIs. |
| Fixed | Audit logging | `audit_logs` and audit recording support privileged and operational actions. |
| Fixed | Migrations | A migration history table and ordered migration runner were added. |
| Fixed | Error mapping | Duplicate, foreign-key, and check constraints map to stable 409/400 responses. |
| Fixed | Password policy | New accounts and password changes require 12-128 characters with character diversity. |
| Fixed | Delete safety | Cascade-heavy deletes now block dependent households, collectors, representatives, and active collection histories. |
| Fixed | Dependencies | Production dependencies currently report zero known npm audit vulnerabilities. |

## Deferred

- Distributed login throttling: the current implementation is process-local and should use Redis or an equivalent shared store for horizontally scaled deployments.
- MFA for privileged roles: requires business and identity-provider decisions.
- Centralized log shipping/SIEM integration: audit records exist in PostgreSQL, but external immutable retention is deployment-dependent.
- Soft deletion and archival: blocked-delete rules are currently used; soft-delete semantics require a business retention decision.

## Requires business decision

- Retention period for audit logs and deleted operational records.
- Whether organizational reassignment may move existing descendants across companies.
- Whether a company representative may update a representative/company hierarchy beyond the currently enforced ownership rules.
- Production domains for CORS and Swagger exposure.

## Test status

- Existing tests: 46 total
- Unit tests: passing
- OpenAPI coverage tests: passing
- Security tests: passing
- PostgreSQL integration transaction test: passing
- Production dependency audit: zero findings

