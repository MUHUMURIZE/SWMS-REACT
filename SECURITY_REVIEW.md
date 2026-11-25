# SWMS Security Review

**Inspection date:** 2026-11-24
**Scope:** Local source review of authentication, authorization, validation, CORS, security middleware, database access, exports, OpenAPI exposure, and related tests. This is not an external penetration test.

## Overall result

**No Critical security finding was confirmed.** The core protections are present: bcrypt password hashes, JWT verification with algorithm/issuer/audience constraints, database-backed token invalidation, route role guards, ownership scopes, parameterized SQL, request validation, CORS allowlisting, Helmet, and structured errors.

The backend is suitable for a React client using bearer tokens when deployed with correctly configured environment and origins. Production deployment still needs the Medium findings below addressed or explicitly accepted.

## Passed controls

- **Password storage:** bcrypt cost 12; new account/password-change passwords require 12–128 characters and upper/lowercase, digit, and symbol characters.
- **Authentication:** one-hour HS256 JWT; issuer/audience configured; JWT ID; DB lookup checks user existence, current token version, and revocation. Role authorization uses the database's current role.
- **Abuse protection:** login rate limiter allows at most 10 failed requests per 15-minute window per IP/normalized email key; successful requests are skipped.
- **Authorization:** explicit route-level roles plus company/collector/household ownership checks for sensitive resources. Notifications are queried and marked read by current user ID.
- **SQL safety:** inspected model queries use parameter placeholders for caller values. Dynamic table names in profile lookup are fixed internal constants, not request data.
- **Validation:** unknown body fields are rejected; IDs are positive safe integers; report identifiers/location filters are bounded; JSON body limit is 1 MB.
- **Transport/browser protections:** Helmet is enabled. Production requires configured `CORS_ORIGINS`; CORS allows configured exact origins and `Authorization`. The React bearer-token flow does not require cookie credentials.
- **Error handling:** database uniqueness, FK, and check errors map to conflict/validation responses; 500 messages do not expose internal stack/message details.
- **File output:** export resources and formats use allowlists; collector/representative scopes are applied; CSV formula-leading values are neutralized.
- **Swagger:** disabled in production unless `SWAGGER_ENABLED=true`; production enablement should be an intentional, reviewed decision.
- **Secrets:** `.env` files and backend `.env` are ignored by Git; `.env.example` contains placeholders rather than credentials.
- **Tests:** security suite 4/4 passed; full suite 58/58; PostgreSQL integration test 1/1.

## Findings

### High — collection creation bypasses the status transition state machine

**Problem:** The collection request schema allows any declared status, including `completed`, on insert. The database trigger constrains status transitions only on updates. Creating a collection as completed avoids the controller's completion side effects.

**Why it matters:** Operational records can be falsely marked complete, while bin state and household/collector/representative notifications remain unchanged. This is a business-integrity issue rather than a privilege escalation.

**Recommendation:** Restrict initial status to an agreed starting state, and make all transitions use the same validated lifecycle path. Add integration tests for rejected terminal-state inserts and valid transitions.

### High — completion side effects can repeat or partially fail

**Problem:** Collection status is committed before the controller empties the bin, sends notifications, and writes audit data. The side effects run whenever the request body says `completed`, including an update that leaves an already-completed record unchanged.

**Why it matters:** A failure can leave status and bin/notifications out of sync. Retrying after a 500 can create duplicate notifications or repeat side effects.

**Recommendation:** Make completion a transactionally coordinated, idempotent operation that detects a real transition and records each side effect once.

### Medium — rate limiting is not shared across instances

**Problem:** The login limiter uses the default process-local store. `app.set("trust proxy", ...)` is not configured.

**Why it matters:** Multiple app instances do not share counters. Behind a reverse proxy, `req.ip` may identify the proxy rather than the end user; a permissive proxy setting would introduce spoofing risk.

**Recommendation:** Use a shared production limiter store and configure only known proxy hops/IP ranges for the actual hosting topology. Do not blindly trust all forwarded headers.

### Medium — audit write failures can obscure committed mutations

**Problem:** Some API operations commit before writing audit records. If the audit insert fails, the caller receives a server error despite a committed change.

**Why it matters:** Frontend retries may duplicate requests or users may believe an operation failed when it succeeded.

**Recommendation:** Include audit writes in the business transaction when appropriate, or use an outbox/idempotency/reconciliation pattern.

### Medium — access-token renewal is not implemented

**Problem:** Tokens expire after one hour and there is no refresh endpoint.

**Why it matters:** React sessions must reauthenticate after expiry; there is no silent renewal flow.

**Recommendation:** Decide whether interactive re-login is acceptable. If not, design a refresh-token lifecycle with rotation/revocation before implementing it.

### Medium — export result sets are unbounded

**Problem:** Export SQL loads all matching rows; XLSX is buffered before sending. Exports include personal contact/address fields for authorized roles.

**Why it matters:** Large datasets can increase memory use and long-running responses; a compromised authorized account can export broad datasets within its role scope.

**Recommendation:** Apply explicit row limits or asynchronous/streamed exports, log export events (already present), and review export role/data minimization requirements.

## React client security guidance

- Send the JWT only over HTTPS in `Authorization: Bearer ...`; never put it in a URL or log it.
- Prefer in-memory token storage. If persistence is required, understand that browser storage is accessible to injected JavaScript; use a strict CSP and XSS defenses.
- Call logout before discarding a live token when practical. On 401, clear local auth state and require login. There is no refresh route.
- Do not enable credentialed CORS unless a future cookie-based design explicitly requires it.
- Keep Swagger disabled in production unless the exposure is deliberately approved.
- Configure production database/JWT secrets outside source control and use a strong random JWT key.

## Test evidence and limits

Executed: `npm test` (**58 passed**), `npm run test:security` (**4 passed**), and `npm run test:integration` (**1 passed**) from `swms-backend`. The integration test used the configured PostgreSQL database and rolled back its test transaction.

These tests are not a penetration test. No React/browser client exists in the repository, and the tests do not cover a full successful login/refresh lifecycle or the collection edge cases identified above.
