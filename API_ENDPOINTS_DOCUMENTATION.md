# SWMS API Endpoint Documentation

Base path: `/api`. Local default origin: `http://localhost:3000`. All protected routes require `Authorization: Bearer <accessToken>`, except `GET /health`.

## Conventions

- **A** = `ADMIN`; **R** = `COMPANY_REPRESENTATIVE`; **C** = `COLLECTOR`; **H** = `HOUSEHOLD`; **Auth** = any authenticated role.
- A listed role is still restricted to its own organization/assigned resources where applicable. Out-of-scope resources generally return 404 rather than revealing their existence.
- JSON success responses use `{ "data": value }`; errors use `{ "error": { "code": "...", "message": "...", "details"?: [...] } }`. `GET /health` is `{ "status": "ok" }`. Deletes return `204` without a body.
- Unless noted otherwise, path `:id` is a positive integer. JSON request bodies reject unknown fields and empty objects.
- Paginated lists accept `?limit=50&offset=0`; `limit` must be 1–200 and `offset` non-negative. Responses contain an array at `data`, without total-count metadata.
- Most endpoints can return 400, 401, 403, 404, 409, or 500 as applicable. 400 is validation/business-constraint failure; 401 is missing/invalid/expired authentication; 403 is role denial; 404 includes out-of-scope resources; 409 is a uniqueness/dependency conflict.
- Role-specific dashboards/reports and schedule routes return JSON. Export routes return a file attachment, not the JSON envelope.

## Authentication and account

| Method and path | Roles | Parameters/body | Success |
|---|---|---|---|
| `POST /api/auth/register` | A | Body: `fullName`, `email`, `password`, `role`; optional `phone`, `address`, `nationalId`, `district`, `sector`, `cell`, `village`. Conditional: R requires `companyId`; C requires `representativeId`; H requires `collectorId` and `address`. Password must meet the strong password policy. | 201 `{data:{id,user}}`; creates a household's bin in the account transaction. |
| `POST /api/auth/login` | Public | Body: `email`, `password`. | 200 `{data:{user,accessToken,tokenType:"Bearer",expiresIn:3600}}`; invalid credentials return 401; rate limited. |
| `POST /api/auth/logout` | Auth | No body. Revokes the current token. | 200 `{data:{message}}` |
| `GET /api/auth/profile` | Auth | None. | 200 `{data:{user,profile}}`; admin profile is `null`. |
| `PUT /api/auth/profile` | Auth | Body: optional `fullName`, `phone`; at least one field. | 200 `{data:{user}}` |
| `PUT /api/auth/change-password` | Auth | Body: `currentPassword`, `newPassword`. | 200 `{data:{message}}`; token version increments, invalidating existing tokens. |

Passwords are preserved exactly as supplied (not trimmed). Email is normalized to lowercase during account creation and login.

## Companies, representatives, collectors, and households

| Method and path | Roles and scope | Parameters/body | Success and behavior |
|---|---|---|---|
| `POST /api/companies` | A | Required `name`; optional `district`, `sector`, `cell`, `village`. | 201 company object. |
| `GET /api/companies` | A | `limit`, `offset`. | 200 company array. |
| `GET /api/companies/:id` | A | Path `id`. | 200 company object. |
| `PUT /api/companies/:id` | A | Path `id`; required `name`; optional location fields. | 200 updated company object. |
| `DELETE /api/companies/:id` | A | Path `id`. | 204; company with an assigned representative is rejected with 409. |
| `POST /api/representatives` | A | Required `fullName`, `email`, `password`, `companyId`; optional `phone` and location fields. | 201 representative object. One representative per company. |
| `GET /api/representatives` | A | `limit`, `offset`. | 200 representative array. |
| `GET /api/representatives/:id` | A | Path `id`. | 200 representative object. |
| `PUT /api/representatives/:id` | A | Path `id`; optional `fullName`, `phone`, `companyId`, location fields. | 200 updated representative object. |
| `DELETE /api/representatives/:id` | A | Path `id`. | 204 if no collectors are assigned; otherwise 409. |
| `POST /api/collectors` | A, R | Required `fullName`, `email`, `password`; optional `phone`, `representativeId`, location fields. A must supply `representativeId`; R is assigned to their own representative and must not supply it. | 201 collector object. R is restricted to their company. |
| `GET /api/collectors` | A, R | `limit`, `offset`. | 200 collector array; R sees their company only. |
| `GET /api/collectors/:id` | A, R | Path `id`. | 200 collector object; R is restricted to their company. |
| `PUT /api/collectors/:id` | A, R | Path `id`; optional `fullName`, `phone`, `representativeId`, location fields. R cannot reassign a collector. | 200 updated collector object. |
| `DELETE /api/collectors/:id` | A, R | Path `id`. | 204 if no households are assigned; otherwise 409. |
| `POST /api/households` | A, R, C | Required `fullName`, `email`, `password`, `address`; optional `phone`, `collectorId`, `nationalId`, location fields. A/R must supply `collectorId`; C is assigned to their own collector. | 201 household object and exactly one associated bin. R must select a collector in their company. |
| `GET /api/households` | A, R, C | `limit`, `offset`. | 200 household array scoped to caller. |
| `GET /api/households/:id` | A, R, C | Path `id`. | 200 household object, if in caller's scope. |
| `PUT /api/households/:id` | A, R, C | Path `id`; optional `fullName`, `phone`, `address`, `nationalId`, location fields. | 200 updated household object, if in caller's scope. |
| `DELETE /api/households/:id` | A, R, C | Path `id`. | 204 if the household has no collection history; otherwise 409. |
| `GET /api/households/me` | H | None. | 200 `{data:{user,profile}}`. |
| `PUT /api/households/me` | H | Optional `fullName`, `phone`, `address`, location fields. | 200 `{data:{user,profile}}`. |

## Waste bins

| Method and path | Roles and scope | Parameters/body | Success and behavior |
|---|---|---|---|
| `POST /api/bins` | A, C | Required `householdId`, `binCode`, `capacity`. | 201 bin object; C may create only for an assigned household. A household may not have a second bin. |
| `GET /api/bins` | A, R, C | `limit`, `offset`. | 200 bin array scoped to company/collector. |
| `GET /api/bins/full` | A, R, C | `limit`, `offset`. | 200 bins with `HIGH` or `FULL` status, scoped to caller. |
| `GET /api/bins/:id` | A, R, C | Path `id`. | 200 bin object, if in caller's scope. |
| `PUT /api/bins/:id` | A, C | Path `id`; optional `binCode`, `capacity`. | 200 updated bin object. |
| `DELETE /api/bins/:id` | A, C | Path `id`. | Currently always 409 while the household exists: each household must retain exactly one bin. |
| `PUT /api/bins/:id/progress` | A, C | Path `id`; body `{ "fillLevel": 0..100 }`. | 200 bin object; crossing thresholds triggers notifications at 80%, 90%, or 100%. |
| `PUT /api/bins/:id/empty` | A, C | Path `id`; no body. | 200 bin object with `fillLevel: 0` and `status: "EMPTY"`. |

Bin status is derived as `EMPTY` (0), `LOW` (1–49), `MEDIUM` (50–79), `HIGH` (80–99), or `FULL` (100). Database triggers enforce fill/status consistency, except the explicit `MAINTENANCE` status.

## Collections and scheduling

| Method and path | Roles and scope | Parameters/body | Success and behavior |
|---|---|---|---|
| `POST /api/collections` | A, R, C | Required `householdId`, `collectorId`, ISO `scheduledAt`; optional status enum and `notes`. Collector must match household assignment; R must stay in their company; C may create only their own work. | 201 collection object. **Caveat:** the create schema currently accepts terminal statuses; see readiness report. |
| `GET /api/collections` | Auth | `limit`, `offset`. | 200 collection array, automatically scoped to caller's company, collector, or household. |
| `GET /api/collections/:id` | Auth | Path `id`. | 200 collection object if in caller's scope. |
| `PUT /api/collections/:id` | A, R, C | Path `id`; optional ISO `scheduledAt`, status enum, `notes`. Assignments cannot be changed. | 200 updated collection object; schedule changes set reschedule timestamps. |
| `PUT /api/collections/:id/status` | A, R, C | Path `id`; required status enum. | 200 updated collection object; database transition rules apply. Setting `completed` triggers bin-empty/notification side effects. |
| `DELETE /api/collections/:id` | A, R | Path `id`. | 204 for deletable work; in-progress, collected, or completed records return 409. |
| `GET /api/collections/scheduling/upcoming` | Auth | Runtime accepts `limit`, `offset`; OpenAPI currently omits them. | 200 array, scoped by role; pending/scheduled work due now or later. |
| `GET /api/collections/scheduling/missed` | Auth | Runtime accepts `limit`, `offset`; OpenAPI currently omits them. | 200 array, scoped by role. |
| `GET /api/collections/scheduling/overdue` | Auth | Runtime accepts `limit`, `offset`; OpenAPI currently omits them. | 200 array, scoped by role; pending/scheduled work before now. |
| `GET /api/collections/scheduling/rescheduled` | Auth | Runtime accepts `limit`, `offset`; OpenAPI currently omits them. | 200 array, scoped by role; records with `rescheduledAt`. |

Collection statuses are `pending`, `scheduled`, `in_progress`, `collected`, `completed`, `missed`, and `cancelled`. Update transitions are database constrained; initial insert status is not subject to that transition trigger.

## Notifications and self-service

| Method and path | Roles and scope | Parameters/body | Success |
|---|---|---|---|
| `GET /api/notifications` | Auth | `limit`, `offset`. | 200 notifications belonging only to the current user. |
| `PUT /api/notifications/:id/read` | Auth | Path `id`. | 200 `{data:{id,read:true}}`; another user's notification returns 404. |
| `GET /api/me` | H | None. | 200 household `{user,profile}`; alias of `/api/households/me`. |
| `PUT /api/me` | H | Optional `fullName`, `phone`, `address`, location fields. | 200 household `{user,profile}`; alias of `/api/households/me`. |
| `GET /api/my-progress` | H | None. | 200 `{data:{counts:[{status,count}]}}`. |
| `GET /api/my-notifications` | H | None. | 200 own notifications (default page; this alias does not validate query pagination). |
| `GET /api/my-bin` | H | None. | 200 own bin object. |

## Dashboards and reports

| Method and path | Roles and scope | Parameters/body | Success |
|---|---|---|---|
| `GET /api/dashboard/admin` | A | None. | 200 aggregate company, collection, overdue, bin distribution, and top-district/company KPIs. |
| `GET /api/dashboard/company` | R | None. | 200 company-scoped collector, household, collection, overdue, and bin metrics. |
| `GET /api/dashboard/collector` | C | None. | 200 collector-scoped workload, collection, and pickup metrics. |
| `GET /api/dashboard/household` | H | None. | 200 own bin, location, next/current collection, and history data. |
| `GET /api/reports/district` | A | Optional query `district` (string, max 160). | 200 aggregated household/bin/collection metrics. |
| `GET /api/reports/sector` | A | Optional query `sector` (string, max 160). | 200 aggregated household/bin/collection metrics. |
| `GET /api/reports/collector` | A, R | Required query `collectorId` (positive integer). | 200 metrics; R may select only a collector in their own company. C is intentionally not allowed; collector self metrics are at `/api/dashboard/collector`. |
| `GET /api/reports/company` | A, R | A requires query `companyId`; R is forced to their own company. | 200 aggregated metrics. |

Report responses include household/bin totals and bin status counts, plus completed, pending, and in-progress collection counts. Reports do not expose list pagination.

## Exports and health

| Method and path | Roles and scope | Parameters/body | Success |
|---|---|---|---|
| `GET /api/exports/:resource/:format` | A, R, C | `resource`: `companies`, `collectors`, `households`, `bins`, `collections`; `format`: `csv`, `xlsx`, `pdf`. | 200 attachment with matching content type and filename. R exports company-scoped data; C may export assigned households/bins/collections only; H is denied. |
| `GET /health` | Public | None. | 200 `{ "status": "ok" }` when PostgreSQL is reachable; otherwise centralized error response. |

There are no file-upload routes. Exports currently have no pagination query and load result sets in memory (PDF is streamed to the response; XLSX is buffered).

The server sets `Content-Disposition` on export responses. The current CORS configuration does not expose that response header to cross-origin JavaScript, so a React client using `fetch` should derive the filename from `resource` and `format` unless the backend exposes the header.

## Authentication and browser contract

Login returns an access token that expires after one hour. Send it in the `Authorization` header; no cookie credentials are required. Logout revokes the current token; password changes invalidate outstanding tokens. There is no refresh-token endpoint.

Generated OpenAPI is available at `/api-docs.json`; Swagger UI is `/api-docs` unless disabled by production configuration. The documented server URL is currently hard-coded to the local development origin.
