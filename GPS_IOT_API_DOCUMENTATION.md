# GPS and IoT API documentation

The generated OpenAPI document is served at `/api-docs.json` and Swagger UI at `/api-docs` when enabled. GPS and IoT routes and validation-backed body schemas are included. User operations use bearer JWTs; device ingestion uses the separate `X-Device-Credential` security scheme.

## Authentication and enrollment

### User authorization

- `ADMIN`: national access.
- `COMPANY_REPRESENTATIVE`: own company and active district resources.
- `COLLECTOR`: only resources assigned to the caller's collector profile in an active authorized district.
- `HOUSEHOLD`: no private fleet, device-management, GPS, or IoT monitoring access.

Company, district, collector, vehicle, and bin scope is resolved and checked on the server. Device association requests accept only `resourceId`; ingestion requests do not accept a client-selected vehicle, bin, company, or district.

### Enroll a hardware device

1. An administrator or company representative submits `POST /api/tracking/devices` or `POST /api/iot/devices` with `{ "deviceCode": "<hardware-identifier>" }`.
2. The `201` response contains a `credential` exactly once. Store it in protected device provisioning storage. The database stores only its SHA-256 hash.
3. Call `PUT /api/tracking/devices/{id}/vehicle` or `PUT /api/iot/devices/{id}/bin` with `{ "resourceId": <existing-resource-id> }`. Server-side authorization verifies ownership and active district access.
4. Send telemetry over HTTPS with `X-Device-Credential`. Do not send the credential from a browser/frontend.
5. Rotate using `POST /api/tracking/devices/{id}/rotate-credential` or `POST /api/iot/devices/{id}/rotate-credential`; the former credential stops working. Revoke using the corresponding `DELETE /api/tracking/devices/{id}` or `DELETE /api/iot/devices/{id}`.

## GPS endpoints

| Method and path | Auth | Notes |
|---|---|---|
| `POST /api/tracking/devices` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Register; one-time credential response |
| `GET /api/tracking/devices` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Scoped, paginated inventory |
| `PUT /api/tracking/devices/{id}/vehicle` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | `{ resourceId }` association |
| `POST /api/tracking/devices/{id}/rotate-credential` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Returns new one-time credential |
| `DELETE /api/tracking/devices/{id}` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Revokes ingestion credential |
| `POST /api/tracking/ingest` | Device credential only | `202`; location ingestion |
| `GET /api/tracking/map` | User JWT; ADMIN, COMPANY_REPRESENTATIVE, COLLECTOR | Authorized fleet tracking rows |
| `GET /api/tracking/vehicles/{vehicleId}/location` | User JWT; ADMIN, COMPANY_REPRESENTATIVE, COLLECTOR | Latest location or explicit null/no-device state |
| `GET /api/tracking/vehicles/{vehicleId}/history` | User JWT; ADMIN, COMPANY_REPRESENTATIVE, COLLECTOR | Paginated history |

GPS ingestion body:

| Field | Type | Requirement and validation |
|---|---|---|
| `messageId` | string | Required, 1–128 chars; deduplication key per device |
| `latitude` | number | Required, −90 to 90, up to 7 decimal places |
| `longitude` | number | Required, −180 to 180, up to 7 decimal places |
| `recordedAt` | date-time | Required; timestamps more than five minutes in the future are rejected |
| `speed` | number | Optional, 0–500; confirm the device's unit (API convention: km/h) |
| `heading` | number | Optional, 0–359.99 degrees clockwise from north |
| `accuracy` | number | Optional, non-negative; confirm device unit (API convention: meters) |

Stored locations include server-generated `receivedAt`. Current tracking status is `ONLINE`, `OFFLINE`, or `NOT_CONFIGURED`; online freshness uses `DEVICE_ONLINE_WINDOW_SECONDS` (default 300). The latest location is selected by device-recorded time, not synthesized.

## Smart-bin IoT endpoints

| Method and path | Auth | Notes |
|---|---|---|
| `POST /api/iot/devices` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Register; one-time credential response |
| `GET /api/iot/devices` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Scoped, paginated inventory |
| `PUT /api/iot/devices/{id}/bin` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | `{ resourceId }` association |
| `POST /api/iot/devices/{id}/rotate-credential` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Returns new one-time credential |
| `DELETE /api/iot/devices/{id}` | User JWT; ADMIN or COMPANY_REPRESENTATIVE | Revokes ingestion credential |
| `POST /api/iot/ingest` | Device credential only | `202`; telemetry ingestion |
| `GET /api/iot/bins/{binId}/latest` | User JWT; ADMIN, COMPANY_REPRESENTATIVE, COLLECTOR | Latest reading and device state |
| `GET /api/iot/bins/{binId}/readings` | User JWT; ADMIN, COMPANY_REPRESENTATIVE, COLLECTOR | Paginated history |
| `GET /api/iot/alerts` | User JWT; ADMIN, COMPANY_REPRESENTATIVE, COLLECTOR | Current active alerts in caller scope |

Telemetry body:

| Field | Type | Requirement and validation |
|---|---|---|
| `messageId` | string | Required, 1–128 chars; deduplication key per device |
| `fillLevel` | integer | Required, 0–100 percent |
| `sensorStatus` | string enum | Required: `OK`, `DEGRADED`, or `FAULT` |
| `measuredAt` | date-time | Required; timestamps more than five minutes in the future are rejected |
| `batteryLevel` | integer | Optional 0–100; only send when supported by the installed sensor |
| `overflowDetected` | boolean | Optional; only send from a real dedicated overflow sensor |

Sensor telemetry also records server-generated `receivedAt`. `FULL` is based on a validated 100% reading. `OVERFLOW` requires a true report from the optional dedicated sensor; it is not inferred from fill level. `SENSOR_FAULT` follows a reported fault. `DEVICE_OFFLINE` means an active device has not communicated within the configured freshness window. A bin without a configured sensor has no sensor reading and is not presented as having fabricated telemetry.

## Pagination, errors, and duplicate handling

Paginated device, alert, and history list endpoints accept `limit` (integer 1–200, default 50) and `offset` (non-negative integer, default 0). History is scoped by the vehicle/bin path and current authorization. No client-supplied company/district filter is trusted or necessary.

All responses use the existing `{ "data": ... }` envelope; errors use `{ "error": { "code": ..., "message": ..., "details": [...] } }` where applicable.

- `400 VALIDATION_ERROR`: invalid body, coordinate, timestamp, or pagination.
- `401 UNAUTHENTICATED`: missing/invalid/revoked device credential or invalid user JWT.
- `403 FORBIDDEN`: wrong device type or disallowed role.
- `404 NOT_FOUND`: missing resource or resource outside caller scope.
- `409 CONFLICT`: unassociated/revoked device, reused message ID with different content, or duplicate active association.
- `426 HTTPS_REQUIRED`: hardware ingestion was attempted over a non-TLS connection in production.
- `500 INTERNAL_SERVER_ERROR`: unexpected persistence/server error.

Repeated `messageId` with exactly the same bound resource and payload is idempotent and does not create another history row or reapply a bin status update. Reuse with changed content or a changed resource association returns `409`.

## Transport and hardware requirements

Only HTTPS REST ingestion is implemented. No MQTT broker, credentials, or frontend broker secret exists. A future MQTT deployment needs TLS, per-device authentication and topic ACLs, payload validation, replay/duplicate handling, reconnect policy, and credential rotation before it is considered active. See [GPS_BACKEND_IMPLEMENTATION.md](./GPS_BACKEND_IMPLEMENTATION.md) and [IOT_BACKEND_IMPLEMENTATION.md](./IOT_BACKEND_IMPLEMENTATION.md) for deployment and hardware gaps.

## Verification status

The configured PostgreSQL development/test database accepted migration `011_gps_iot_devices.sql`. Backend tests passed (98/98); frontend tests passed (6/6); the frontend production build passed. Lint exited successfully with a warning in untouched `src/context/AuthContext.tsx`. These automated results do not confirm hardware operation: no physical GPS or bin sensor has been verified sending data.
