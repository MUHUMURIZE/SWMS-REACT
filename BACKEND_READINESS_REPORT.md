# SWMS Backend Readiness Report

**Inspection date:** 2026-11-24
**Scope:** `swms-backend` source, routes, models, services, middleware, PostgreSQL schema/migrations, generated OpenAPI, tests, and the repository's `swms-frontend` directory. This is a source and configured-database inspection, not a penetration test or a production deployment certification.

## Executive recommendation

**React API integration: READY WITH DOCUMENTED CAVEATS.** The backend exposes authenticated JSON APIs, bearer-token authentication, role-scoped endpoints, pagination on its main list endpoints, CORS configuration, and binary downloads. The full backend test suite, security tests, and PostgreSQL integration test passed during this inspection.

**End-to-end React integration: NOT VERIFIED.** `swms-frontend` contains no files or package manifest. There is no React client, browser test, or frontend build to validate against the API.

**Production workflow readiness: CONDITIONAL.** Collection creation can set a terminal status directly, bypassing update-time state transitions; completion side effects are not idempotent or atomic with the status change. Resolve these workflow risks and complete frontend/browser integration tests before relying on the system for live operations.

No application code, tests, environment files, or database schema/migrations were changed during this inspection. The five requested documents are the only deliverables from this task.

## Project structure and architecture

The backend is organized into `config`, `controllers`, `database`, `docs`, `middleware`, `models`, `routes`, `scripts`, `services`, `tests`, `utils`, and `validation`. `server.js` mounts the route modules and central middleware. SQL is parameterized through `pg`; account creation and several profile/collection operations use transactions.

**Passed**

- Routes are separated from controllers and SQL models.
- Authentication, validation, authorization, error mapping, pagination, and export helpers are reusable modules.
- Route declarations are covered by a test that checks generated OpenAPI path coverage.
- `swms-frontend` is empty; this repository state cannot demonstrate a working React integration.

**Low — documentation drift:** `swms-backend/README.md` describes `database/` as a MySQL schema even though the implementation is PostgreSQL. It also says representative/collector deletion cascades through descendants, while their API controllers reject deletion when assigned children exist. Use the actual API behavior in the new endpoint documentation.

**Low — duplicated aliases:** Household self-profile operations exist at both `/api/me` and `/api/households/me`; household notifications are available at both `/api/my-notifications` and `/api/notifications`. These aliases currently call the same controller behavior and can be retained for compatibility.

## Authentication, authorization, and security

**Passed**

- Passwords are hashed with bcrypt cost 12. New passwords require 12–128 characters with lowercase, uppercase, numeric, and symbol characters.
- Login uses a generic invalid-credentials response and has a 10-attempt/15-minute limiter keyed by IP and normalized email.
- JWTs use HS256, issuer and audience checks, one-hour expiry, a token ID, database-backed token-version validation, and logout revocation.
- Protected requests resolve the user's current role from PostgreSQL; the token's role claim is not the authorization source.
- Role checks are applied at routes, with company/collector/household resource scoping in service/controller/model queries.
- CORS allows configured exact origins and `Authorization`; production refuses to start without `CORS_ORIGINS` and a 32-character JWT secret. Helmet is enabled. JSON request bodies are limited to 1 MB.
- Swagger is disabled by default in production and can be enabled with `SWAGGER_ENABLED=true`.
- CSV export cells beginning with formula characters are neutralized.

**Medium — deployment-dependent login limiting:** `express-rate-limit` uses its default in-process store, and Express proxy trust is not configured. In a multi-instance deployment the counters are not shared; behind a reverse proxy, client IP handling must be configured deliberately. Use a shared limiter store and a narrowly configured trusted-proxy policy for that topology.

**Medium — token renewal:** There is no refresh-token endpoint. Clients must prompt for login again after the one-hour access token expires. This is an integration/product decision, not an authentication bypass.

**Medium — audit-write ambiguity:** Several controllers write audit entries after the business mutation has committed. If the audit insert fails, the client can receive a 500 even though the mutation succeeded. The client must not blindly retry non-idempotent operations; production behavior should either make the audit write atomic with the operation or expose an idempotency/reconciliation strategy.

## PostgreSQL and data integrity

**Passed — configured database snapshot:** A read-only inspection found the expected 11 application/migration tables, 39 indexes (19 unique), and recorded migrations `002_household_exactly_one_bin.sql` through `006_bin_fill_history.sql`. At inspection time, checks found zero:

- user/profile role mismatches;
- households with other than exactly one bin;
- collections assigned to a collector different from the household's assigned collector;
- bin fill/status mismatches (excluding `MAINTENANCE`);
- duplicate company-representative, profile-user, or case-insensitive email groups.

These are observations about the database configured in the local test environment only; they do not prove production data is clean.

Schema protections include foreign keys, unique user emails, one representative per company, one bin per household, fill/capacity checks, collection household/collector consistency, collection status constraints, bin-status triggers, and deferred household-bin integrity enforcement. Supporting indexes cover common user, ownership, scheduling, notification, audit, and history lookups.

**Medium — schema bootstrap and migration history:** `scripts/migrate.js` applies numbered migrations but does not create the baseline tables; a fresh database must first receive `database/schema.sql`. The baseline schema already includes later operational features while migration files reapply some of them idempotently. Keep this order explicit in deployment automation and verify migration history after provisioning.

**Medium — collection lifecycle invariant:** `collection_status` is validated on insert, but `enforce_collection_status_transition()` only checks updates. `POST /api/collections` accepts statuses such as `completed`, `collected`, `missed`, or `cancelled` at creation. Creating a completed collection bypasses the update-time completion path that empties the bin and sends completion notifications. Enforce the intended initial status and lifecycle consistently before live use.

No schema change was made; this report records a verified application/schema behavior gap for a separate, justified fix.

## API, OpenAPI, and React contract

**Passed**

- The route inventory contains 62 application operations plus `GET /health`; generated OpenAPI covers all declared routes.
- JSON success responses generally use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details?" } }`.
- Deletes return `204` with no body. Exports return CSV, XLSX, or PDF attachments. Health returns `{ "status": "ok" }`.
- Main entity, bin, collection, and notification list routes accept `limit` (default 50, maximum 200) and `offset` (default 0).
- Report filters and export resource/format allowlists are validated; collection/report/export access is role-scoped.

**Medium — completion side effects are not idempotent/atomic:** Both collection update handlers empty the bin and create notifications after the collection model commits. Repeating a request with status `completed` can repeat those side effects even if the status did not change. A failure during bin/notification work can also leave a completed collection with a full bin or incomplete notifications. Make completion a single transactional/idempotent operation before operational deployment.

**Medium — OpenAPI gaps:** The generated spec documents every route, but it does not document `limit`/`offset` on the four scheduling endpoints even though those routes validate them. Several success examples fall back to `{ data: { id, message } }` although the endpoint returns a collection, report, or scheduling list. The OpenAPI `servers` URL is hard-coded to `http://localhost:3000`. These do not prevent a frontend from calling the API, but the spec should be corrected before using it as a production client-generation contract.

**Low — download filename header is not exposed to browser JavaScript:** Export responses set `Content-Disposition`, but the CORS configuration does not expose that response header. Cross-origin `fetch` clients can read the file body but cannot inspect the attachment filename. Expose `Content-Disposition` if the React app needs to use the server-provided filename; otherwise derive it from the known resource and format.

**Low — pagination metadata:** List endpoints return arrays in `data` without total count or `hasMore` metadata. A React client can request pages and infer continuation from the returned page length, but cannot display an exact total.

**Low — export resource growth:** Export queries read all matching rows into memory; XLSX is built as an in-memory buffer. Large datasets can consume significant application memory. Add bounded/streamed exports or an explicit operational cap as data volume grows.

## Testing performed

Executed from `swms-backend`:

| Command | Result |
|---|---:|
| `npm test` | **58 passed, 0 failed, 0 skipped** |
| `npm run test:security` | **4 passed, 0 failed** |
| `npm run test:integration` | **1 passed, 0 failed** |

The integration test connected to the configured PostgreSQL database and rolled back its fixture transaction. Existing tests cover validation, representative/collector/household ownership, bin rules, reports, exports, route authentication, and OpenAPI path coverage.

**Coverage gap:** There is no React/browser integration test. The tests do not exercise a complete successful login → authenticated business request → logout flow against PostgreSQL, nor do they test collection creation with a terminal status or repeat-completion side effects. These cases should be added with the corresponding workflow work.

## Remaining blockers and priorities

1. **High:** Prevent terminal collection states at creation and make the collection state machine consistent across insert/update.
2. **High:** Make completion/bin-empty/notification side effects atomic and idempotent.
3. **Medium:** Align Swagger scheduling parameters, response examples, and deployment server URL with runtime behavior.
4. **Medium:** Configure shared rate limiting and trusted proxy behavior for the actual production topology.
5. **Medium:** Define audit failure semantics so a 500 cannot obscure a committed mutation.
6. **Medium:** Build and test the absent React frontend; verify CORS with its exact deployed origin.
7. **Low:** Expose `Content-Disposition` for cross-origin fetch downloads if the client needs server filenames.
8. **Low:** Correct README PostgreSQL/deletion statements and add pagination metadata if exact counts are a frontend requirement.

## Readiness classification

| Area | Classification |
|---|---|
| Backend project structure | Passed |
| Auth/token verification and role boundaries | Passed, with deployment caveats |
| PostgreSQL schema and inspected local data invariants | Passed for inspected database |
| CRUD, reports, and exports | Passed by existing tests; operational caveats above |
| OpenAPI route coverage | Passed |
| OpenAPI runtime detail/examples | Medium gaps |
| React API consumption | Ready |
| React end-to-end behavior | Not verified; frontend absent |
| Production collection workflow | Not ready until High findings are addressed |
