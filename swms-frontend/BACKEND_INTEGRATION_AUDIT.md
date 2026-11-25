# SWMS Backend Integration Audit

## 1. Audit scope and conclusion

Updated 2026-11-25 after active district authorization and the initial vehicle/fleet API implementation. Backend and frontend verification results are recorded in the root `SWMS_COMPLETION_REPORT.md`.

The Node.js/Express/PostgreSQL API provides company-scoped CRUD, dashboards, scheduling, bin monitoring, notifications, reports, binary exports, National Administrator district/agreement management, and fleet registration/assignment/maintenance APIs. Company and collector operational access is constrained by active district agreements across household, bin, collection, scheduling, report, export, and dashboard paths. The fleet frontend is implemented. GPS/device and service-request backends are not configured; related frontend screens clearly identify those integrations as unavailable.

## 2. Runtime and API conventions

- Base path: `/api`
- Health: `GET /health`
- Swagger UI: `/api-docs` when enabled
- OpenAPI JSON: `/api-docs.json`
- Default local origin: `http://localhost:3000`
- JSON success: `{ "data": value }`
- JSON error: `{ "error": { "code": "...", "message": "...", "details": [...] } }`
- Resource deletes: `204 No Content`; vehicle assignment release returns the updated vehicle in a `200` data envelope
- Binary exports: `200` with CSV, XLSX, or PDF content
- Authentication: `Authorization: Bearer <accessToken>`
- Protected route: missing or invalid bearer token returns `401`
- Role denial: `403`
- Out-of-scope resources generally return `404`
- Unique/dependency conflicts: `409`
- Validation/business constraint failures: `400`
- Main list routes accept `limit` (default `50`, maximum `200`) and `offset` (default `0`)
- List responses are arrays with no total count or `hasMore` metadata
- Unknown JSON fields and empty request objects are rejected
- Path IDs are positive integers unless documented otherwise

## 3. Authentication and roles

There is no refresh-token endpoint. Access tokens expire after one hour.

| Role | Backend value | Scope |
|---|---|---|
| National Administrator | `ADMIN` | System-wide access |
| Company Representative | `COMPANY_REPRESENTATIVE` | Own company, collectors, households, and collections |
| Collector | `COLLECTOR` | Assigned collector households and collections |
| Household | `HOUSEHOLD` | Own profile, bin, progress, and notifications |

JWT validation uses HS256, issuer `swms-api`, audience `swms-api`, JWT ID, token expiry, database user lookup, and token version. Logout revokes the current JWT. A password change invalidates outstanding JWTs.

No role named `National Administrator` exists separately; the frontend should map `ADMIN` to National Administrator.

## 4. Verified endpoint inventory

### Authentication and account

| Method | Path | Authentication and role | Notes |
|---|---|---|---|
| `POST` | `/api/auth/register` | `ADMIN` | Creates an account and role profile |
| `POST` | `/api/auth/login` | Public | Returns access token and user |
| `POST` | `/api/auth/logout` | Authenticated | Revokes current token |
| `GET` | `/api/auth/profile` | Authenticated | Returns user and role profile |
| `PUT` | `/api/auth/profile` | Authenticated | Optional `fullName`, `phone` |
| `PUT` | `/api/auth/change-password` | Authenticated | Invalidates existing tokens |

Login example:

```json
{
  "email": "admin@example.com",
  "password": "StrongPassword123!"
}
```

Login success:

```json
{
  "data": {
    "user": {
      "id": 1,
      "fullName": "National Administrator",
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
}
```

Registration requires role-specific fields:

- `COMPANY_REPRESENTATIVE`: `companyId`
- `COLLECTOR`: `representativeId`
- `HOUSEHOLD`: `collectorId` and `address`
- Every account: `fullName`, `email`, `password`, `role`

Passwords must be 12–128 characters and contain lowercase, uppercase, numeric, and symbol characters.

### Companies and representatives

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/companies` | `ADMIN` |
| `GET` | `/api/companies` | `ADMIN` |
| `GET` | `/api/companies/:id` | `ADMIN` |
| `PUT` | `/api/companies/:id` | `ADMIN` |
| `DELETE` | `/api/companies/:id` | `ADMIN` |
| `POST` | `/api/representatives` | `ADMIN` |
| `GET` | `/api/representatives` | `ADMIN` |
| `GET` | `/api/representatives/:id` | `ADMIN` |
| `PUT` | `/api/representatives/:id` | `ADMIN` |
| `DELETE` | `/api/representatives/:id` | `ADMIN` |

Company request example:

```json
{
  "name": "Green City Waste",
  "district": "Kayonza",
  "sector": "Gahini",
  "cell": "Kiyenzi",
  "village": "Rugarama"
}
```

Representative request example:

```json
{
  "fullName": "Riley Representative",
  "email": "riley@example.com",
  "password": "StrongPass123!",
  "companyId": 1,
  "phone": "+250700000000",
  "district": "Kayonza"
}
```

The backend enforces at most one representative per company. Company deletion is rejected while a representative is assigned. Representative deletion is rejected while collectors are assigned.

### Districts and company agreements

These endpoints are restricted to `ADMIN`:

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/districts` | Create a district |
| `GET` | `/api/districts` | Paginated national district list and assignment state |
| `GET` | `/api/districts/:id` | Get a district |
| `POST` | `/api/districts/:id/agreements` | Create a `PENDING` agreement |
| `GET` | `/api/districts/:id/agreements` | View assignment history for a district |
| `GET` | `/api/districts/agreements` | View national assignment history |
| `POST` | `/api/districts/agreements/:id/status` | Explicitly activate, suspend, or terminate an agreement |

Agreement terms use date-only `startsOn` and optional `endsOn`. New agreements are pending and cannot grant operational authority until an administrator activates them. PostgreSQL prevents overlapping pending/active periods and enforces at most one active agreement per district. Suspending or terminating an active agreement sets the separate district operational state to `UNASSIGNED`, writes an audit entry, notifies administrators, and preserves the agreement row. Expired agreements are transitioned by the backend's hourly expiry job and also notify administrators. A replacement agreement must be created pending and explicitly activated.

The administrator frontend is available at `/districts`. Districts and agreements created by older free-text `district` fields are **not** auto-imported or auto-authorized; no historical company ownership is inferred.

Company and collector operational access requires an active agreement for the household's district and matching collector/household districts. Ending an agreement automatically releases fleet vehicles assigned to collectors in that district. Legacy free-text districts do not grant access.

### Collectors

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/collectors` | `ADMIN`, `COMPANY_REPRESENTATIVE` |
| `GET` | `/api/collectors` | `ADMIN`, `COMPANY_REPRESENTATIVE` |
| `GET` | `/api/collectors/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE` |
| `PUT` | `/api/collectors/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE` |
| `DELETE` | `/api/collectors/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE` |

Admin requests require `representativeId`. Company representatives are assigned their own representative and must not supply or reassign it. Representative-scoped list/get/update/delete operations are enforced by backend queries.

Collector request example:

```json
{
  "fullName": "Jordan Collector",
  "email": "jordan@example.com",
  "password": "StrongPass123!",
  "representativeId": 1,
  "district": "Kayonza",
  "sector": "Gahini"
}
```

### Vehicles and fleet

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/vehicles` | `ADMIN`, `COMPANY_REPRESENTATIVE`, assigned `COLLECTOR` |
| `POST` | `/api/vehicles` | `ADMIN`, `COMPANY_REPRESENTATIVE` |
| `GET` | `/api/vehicles/:id` | `ADMIN`, owning `COMPANY_REPRESENTATIVE`, assigned `COLLECTOR` |
| `PUT` | `/api/vehicles/:id` | `ADMIN`, owning `COMPANY_REPRESENTATIVE` |
| `PUT` | `/api/vehicles/:id/status` | `ADMIN`, owning `COMPANY_REPRESENTATIVE` |
| `PUT` | `/api/vehicles/:id/assignment` | `ADMIN`, owning `COMPANY_REPRESENTATIVE` |
| `DELETE` | `/api/vehicles/:id/assignment` | `ADMIN`, owning `COMPANY_REPRESENTATIVE` |
| `GET` | `/api/vehicles/:id/assignments` | Authorized vehicle reader |
| `GET` | `/api/vehicles/:id/maintenance` | Authorized vehicle reader |
| `POST` | `/api/vehicles/:id/maintenance` | `ADMIN`, owning `COMPANY_REPRESENTATIVE` |
| `PUT` | `/api/vehicles/:id/maintenance/:maintenanceId/status` | `ADMIN`, owning `COMPANY_REPRESENTATIVE` |

Vehicle records include registration, type, make/model, decimal capacity, fuel type, and registration, insurance, and inspection expiry dates. Administrators must supply the owner company at creation; representatives are bound to their own company. A vehicle can be assigned only to a collector in the same company with active district authorization. Only one vehicle may be assigned to a collector at a time. Assignment and maintenance histories are retained; ending the district agreement releases affected vehicles.

Statuses: `AVAILABLE`, `IN_SERVICE`, `MAINTENANCE`, `INACTIVE`. An assigned vehicle must be `IN_SERVICE`. Maintenance starts as `SCHEDULED` and can be completed or cancelled.

### Households

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/households` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `GET` | `/api/households` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `GET` | `/api/households/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `PUT` | `/api/households/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `DELETE` | `/api/households/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `GET` | `/api/households/me` | `HOUSEHOLD` |
| `PUT` | `/api/households/me` | `HOUSEHOLD` |

Household request example:

```json
{
  "fullName": "Taylor Household",
  "email": "taylor@example.com",
  "password": "StrongPass123!",
  "collectorId": 1,
  "address": "10 Main Street",
  "nationalId": "NATIONAL-ID",
  "district": "Kayonza",
  "sector": "Gahini"
}
```

Creating a household creates exactly one associated waste bin. Deletion is rejected while collection history exists.

### Waste bins

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/bins` | `ADMIN`, `COLLECTOR` |
| `GET` | `/api/bins` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `GET` | `/api/bins/full` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `GET` | `/api/bins/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `PUT` | `/api/bins/:id` | `ADMIN`, `COLLECTOR` |
| `DELETE` | `/api/bins/:id` | `ADMIN`, `COLLECTOR` |
| `PUT` | `/api/bins/:id/progress` | `ADMIN`, `COLLECTOR` |
| `PUT` | `/api/bins/:id/empty` | `ADMIN`, `COLLECTOR` |

Bin request and progress examples:

```json
{ "householdId": 1, "binCode": "BIN-0001", "capacity": 120 }
```

```json
{ "fillLevel": 85 }
```

Bin status values: `EMPTY`, `LOW`, `MEDIUM`, `HIGH`, `FULL`, `MAINTENANCE`.

The schema and database trigger derive status from fill level: `0`, `1–49`, `50–79`, `80–99`, `100`. The delete operation is currently rejected while a household exists because every household must retain exactly one bin.

### Collections and scheduling

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/collections` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `GET` | `/api/collections` | Authenticated |
| `GET` | `/api/collections/:id` | Authenticated |
| `PUT` | `/api/collections/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `PUT` | `/api/collections/:id/status` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |
| `DELETE` | `/api/collections/:id` | `ADMIN`, `COMPANY_REPRESENTATIVE` |
| `GET` | `/api/collections/scheduling/upcoming` | Authenticated |
| `GET` | `/api/collections/scheduling/missed` | Authenticated |
| `GET` | `/api/collections/scheduling/overdue` | Authenticated |
| `GET` | `/api/collections/scheduling/rescheduled` | Authenticated |

Collection create example:

```json
{
  "householdId": 1,
  "collectorId": 1,
  "scheduledAt": "2026-11-25T09:00:00Z",
  "status": "scheduled",
  "notes": "Scheduled pickup"
}
```

Status update example:

```json
{ "status": "completed" }
```

Statuses: `pending`, `scheduled`, `in_progress`, `collected`, `completed`, `missed`, `cancelled`.

Database transitions are enforced. Scheduling routes accept `limit` and `offset` at runtime, although the generated OpenAPI currently omits those parameters. Collections are scoped by role and organization. A collection's collector must match the household's assigned collector.

### Notifications and household self-service

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/notifications` | Authenticated |
| `PUT` | `/api/notifications/:id/read` | Authenticated |
| `GET` | `/api/me` | `HOUSEHOLD` |
| `PUT` | `/api/me` | `HOUSEHOLD` |
| `GET` | `/api/my-progress` | `HOUSEHOLD` |
| `GET` | `/api/my-notifications` | `HOUSEHOLD` |
| `GET` | `/api/my-bin` | `HOUSEHOLD` |

`/api/me` and `/api/my-*` are aliases for the household self-service functionality. `/api/households/me` and `/api/me` return the same profile shape.

### Dashboards

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/dashboard/admin` | `ADMIN` |
| `GET` | `/api/dashboard/company` | `COMPANY_REPRESENTATIVE` |
| `GET` | `/api/dashboard/collector` | `COLLECTOR` |
| `GET` | `/api/dashboard/household` | `HOUSEHOLD` |

Dashboard responses contain aggregate objects rather than paginated arrays. Their exact fields are role-specific and must be typed from controller/model output rather than redefined in a mock.

### Reports

| Method | Path | Role | Query |
|---|---|---|---|
| `GET` | `/api/reports/district` | `ADMIN` | Optional `district` |
| `GET` | `/api/reports/sector` | `ADMIN` | Optional `sector` |
| `GET` | `/api/reports/collector` | `ADMIN`, `COMPANY_REPRESENTATIVE` | Required `collectorId` |
| `GET` | `/api/reports/company` | `ADMIN`, `COMPANY_REPRESENTATIVE` | Admin requires `companyId`; representative is forced to own company |

Report success contains aggregated household, bin, and collection metrics. A collector has personal metrics at `/api/dashboard/collector`, not `/api/reports/collector`.

### Exports

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/exports/:resource/:format` | `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR` |

Allowed resources:

- `companies`
- `collectors`
- `households`
- `bins`
- `collections`

Allowed formats:

- `csv`
- `xlsx`
- `pdf`

Representative exports are company-scoped. Collector exports are assigned-household/work scoped. Household users cannot export system resources.

### Health

| Method | Path | Authentication |
|---|---|---|
| `GET` | `/health` | Public |

Success:

```json
{ "status": "ok" }
```

## 5. Database relationships and business rules

The principal hierarchy is:

```text
Company
  -> Representative
    -> Collector
      -> Household
        -> exactly one Waste Bin
        -> Collections
```

The backend has:

- Unique company name
- At most one representative per company
- Unique user email
- Unique household bin
- Household/collector consistency for collections
- Collection status transition constraints
- Bin fill/status consistency
- Notification, audit, and revoked-token records
- Cascades and dependency guards on account deletion

The collection workflow is transactionally protected: completing a collection locks and updates the collection, empties the household bin, creates notifications, and writes an audit record. Repeated completion does not repeat the side effects.

## 6. Request validation and response behavior

Request validation is centralized in `middleware/validate.js` and `validation/schemas.js`. Validation:

- Requires expected fields
- Enforces string lengths
- Enforces positive numeric IDs
- Enforces ISO datetime fields
- Enforces role and collection status enums
- Rejects unknown fields
- Rejects empty objects
- Applies strong-password and email rules

Errors follow `{ error: { code, message, details? } }`. PostgreSQL constraint violations are mapped to `400`, `409`, or central `500` handling. Pagination is validated separately and caps `limit` at `200`.

## 7. Required frontend pages

Pages should be based only on verified capabilities:

1. Login
2. Role-specific Dashboard
3. Companies
4. National Districts & Agreements (implemented; administrator-only)
5. Representatives
6. Collectors
7. Households
8. Waste Bins / Smart Bin Monitoring
9. Collections
10. Collection Scheduling
11. Notifications
12. Reports
13. Exports
14. Household Profile / Progress / My Bin
15. Fleet Management (registration, assignment, status, and maintenance UI)
16. GPS Tracking and IoT Device Readiness (integration status only; no live data)
17. Support & Service Requests (integration status only; no request submission)
18. User Profile
19. Settings

Do not present live GPS, route progress, or sensor readings as operational until authenticated device/mobile integrations exist and have been verified.

Role-specific navigation:

- `ADMIN`: companies, representatives, collectors, fleet, GPS/device readiness, households, bins, collections, scheduling, reports, exports, support status
- `COMPANY_REPRESENTATIVE`: collectors, fleet, GPS/device readiness, households, bins, collections, scheduling, company dashboard, reports, support status
- `COLLECTOR`: assigned fleet vehicle, GPS readiness, assigned households, bins, collections, scheduling, collector dashboard, support status
- `HOUSEHOLD`: own profile, bin, progress, notifications, support integration status, household dashboard

## 8. Remaining API functionality

The following required business areas remain missing or incomplete:

### District management and assignments

District CRUD, national agreement history, pending assignment creation, explicit activation/termination/suspension, overlap prevention, operational `ASSIGNED`/`UNASSIGNED` state, administrator notification, audit history, expiry processing, and agreement-based operational scoping are implemented. Legacy free-text locations still require reviewed mapping; they do not grant authorization.

### Vehicle and fleet management

Vehicle registration, update, status, collector assignment, assignment history, and maintenance scheduling/history APIs are implemented. The frontend supports role-aware vehicle registration/update, assignment/release, status, and maintenance workflows. Fleet dashboard metrics, maintenance reminders, and collection-to-vehicle assignment are not implemented yet.

### GPS and live tracking

No GPS device, location history, live vehicle position, geofence, or tracking-stream endpoint exists. The GPS page is an integration-readiness screen only; backend ingestion, device authentication, access enforcement, and verified telemetry are required before a map or live tracking can be implemented.

The existing location fields are textual addresses/geography labels, not coordinates or live GPS data.

### Other gaps

- No search query contract on entity list endpoints
- No sorting contract on entity list endpoints
- No exact total count or `hasMore` pagination metadata
- No refresh-token or session endpoint
- No MFA
- No dedicated user-management route separate from role registration/account profile flows
- No district-sector-cell-village hierarchy endpoints
- No GPS/device telemetry or household support/service-request APIs
- No global notifications preferences endpoint
- Scheduling pagination is runtime-supported but omitted from OpenAPI
- OpenAPI server URL is deployment-sensitive and currently defaults to the local API origin
- Export downloads need a loading flow and Blob handling

## 9. Integration risks

1. **Tenant isolation must remain backend-authoritative.** Never trust a supplied company ID as authorization. Hide unauthorized actions by role, but always rely on server scoping.
2. **Legacy location mapping remains manual.** Existing free-text districts do not automatically grant access; explicitly map and approve existing records before companies begin operations.
3. **No exact pagination count.** Infer final pages from page length and disable previous/next based on offset and returned length.
4. **No refresh token.** Expired one-hour JWTs require sign-in again.
5. **Terminal collection workflow.** Initial statuses are now constrained to `pending` or `scheduled`; the UI must offer only these states for create operations.
6. **Collection status transitions.** UI controls must reflect database transitions and handle `400/409`.
7. **Completion side effects.** Repeated completion is idempotent in the backend, but the UI should still prevent duplicate submissions with loading and disabled controls.
8. **Delete conflicts.** Profile, collection, bin, representative, collector, household, and company deletions may return `409` until dependencies are removed.
9. **Cross-origin configuration.** Set exact frontend origin in backend `CORS_ORIGINS`; `Content-Disposition` is exposed to browser JavaScript.
10. **Exports.** Export all rows in memory and have no pagination; use a bounded user action and loading state.
11. **Redis and production proxy.** Production requires Redis-backed login throttling and explicit trusted-proxy hops.
12. **Secrets.** `JWT_SECRET`, database credentials, Redis credentials, and other secrets must never enter Vite environment variables or source.
13. **XSS and token storage.** Memory storage is preferred. If local storage is used for reload persistence, it must be accompanied by strict CSP and XSS controls.
14. **OpenAPI drift.** Scheduling pagination and some examples are incomplete. Typed services should follow runtime routes and controller response shapes, not placeholders.

## 10. Recommended implementation order

1. Initialize Vite/React/TypeScript/Tailwind and environment configuration.
2. Add centralized Axios API client, bearer token support, and 401/403/409/429/error handling.
3. Implement authentication store/context, login, logout, profile, password change, and protected routes.
4. Implement role-specific navigation and dashboard shells.
5. Integrate role-specific dashboard endpoints.
6. Integrate companies and representatives for administrators.
7. Integrate collectors and households with server-side scope handling.
8. Integrate waste bins and bin fill/empty operations.
9. Integrate collections and scheduling with status-transition-safe forms.
10. Integrate notifications and household self-service.
11. Integrate reports and CSV/XLSX/PDF downloads.
12. Add pagination, loading, empty, error, and access-denied states.
13. Add browser integration tests for login, role navigation, unauthorized access, CRUD, scheduling, notifications, and exports.
14. Add end-to-end tests for company, collector, household, and administrator isolation across district-scoped APIs.
15. Add collection-to-vehicle assignment and fleet dashboard metrics; implement GPS/IoT telemetry interfaces only after authenticated device/mobile integrations are operational.

## 11. State and error handling requirements

For every backend-backed view:

- Show a loading state during requests
- Show an empty state only after a successful empty result
- Show centralized API error messages
- Convert `401` to sign-out/login
- Convert `403` to access denied
- Convert `404` to not found or out of scope
- Convert `409` to a non-destructive conflict message
- Convert `429` to retry-after guidance
- Disable submit buttons while mutation requests are in flight
- Re-fetch or invalidate relevant TanStack Query keys after successful mutations
- Use offset/limit pagination and do not infer exact totals

## 12. Frontend type and service mapping

Create typed services for:

- `auth`
- `dashboard`
- `companies`
- `representatives`
- `collectors`
- `households`
- `bins`
- `collections`
- `scheduling`
- `notifications`
- `reports`
- `exports`
- `vehicles`

The API client must unwrap `data` for JSON calls and must preserve `Blob` responses for exports. It must not contain mock API data or duplicate backend authorization/business-transition logic.
