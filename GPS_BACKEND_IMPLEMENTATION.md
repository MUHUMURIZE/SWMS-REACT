# GPS backend implementation

## Status

The backend now supports GPS device enrollment, authenticated location ingestion, role-scoped tracking, latest-location lookup, and paginated location history. No physical GPS unit has been enrolled or observed sending data in this work; live tracking is not verified until an actual device successfully posts readings.

## Database

Migration `swms-backend/database/migrations/011_gps_iot_devices.sql` adds:

- `resource_devices` for GPS and bin-sensor enrollment, hashed credentials, one active resource association, revocation, and last communication time.
- `vehicle_locations` for validated coordinates, optional speed/heading/accuracy, device-reported time, server-received time, and per-device message deduplication.
- Vehicle/time and device/receive-time indexes for latest-position and history queries.

Coordinates use PostgreSQL numeric columns and range constraints; no PostGIS extension is required by the existing application. Location writes and device communication updates run in a PostgreSQL transaction.

## Endpoints

User-facing endpoints require a bearer JWT; access is further scoped by role, company, collector assignment, and active district agreement.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/tracking/devices` | Register a GPS device; returns its credential once |
| `GET` | `/api/tracking/devices` | List GPS devices managed by an administrator or company representative |
| `PUT` | `/api/tracking/devices/:id/vehicle` | Associate an enrolled device to a server-authorized vehicle |
| `POST` | `/api/tracking/devices/:id/rotate-credential` | Invalidate the old credential and issue a new one |
| `DELETE` | `/api/tracking/devices/:id` | Revoke device access |
| `POST` | `/api/tracking/ingest` | Accept a device-authenticated location |
| `GET` | `/api/tracking/map` | Return authorized vehicle tracking/map data |
| `GET` | `/api/tracking/vehicles/:vehicleId/location` | Return latest location, status, and last communication |
| `GET` | `/api/tracking/vehicles/:vehicleId/history` | Return paginated location history |

History uses `limit` (1–200, default 50) and `offset` (default 0); the path vehicle and the caller's current server-side authorization determine the data scope. Clients cannot select another company, district, vehicle, or collector by including those identifiers in a request body.

## Device security and ingestion

1. An administrator or company representative registers a physical unit with a unique `deviceCode`.
2. The API returns a 256-bit random `credential` once. The raw credential is not stored; the database keeps its SHA-256 hash.
3. A manager associates the device with an existing vehicle after server-side company/district checks.
4. The device sends `X-Device-Credential` over HTTPS with a JSON body containing `messageId`, `latitude`, `longitude`, and `recordedAt`; optional fields are `speed`, `heading`, and `accuracy`.
5. The server derives the vehicle from the authenticated device association. Device-supplied vehicle/company/district IDs are not accepted.

Coordinates and optional values are range checked, timestamps more than five minutes in the future are rejected, and duplicate `messageId` submissions are idempotent only when their payload matches. Reusing an identifier with changed values returns `409`. Credential rotation and revocation are audited. Protect credentials in device storage; never put them in React code, URLs, logs, or shared configuration. Production deployments must terminate HTTPS at the API or trusted reverse proxy; the ingestion middleware rejects non-HTTPS production requests with `426 HTTPS_REQUIRED`.

The API reports `ONLINE` when a device has communicated within `DEVICE_ONLINE_WINDOW_SECONDS` (default 300 seconds), otherwise `OFFLINE`. A vehicle with no active associated unit is `NOT_CONFIGURED`. The received location and communication timestamp come from persisted device messages, not synthetic positions.

## Authorization

- National administrators can access national fleet tracking.
- Company representatives are scoped to their company's vehicles and active districts.
- Collectors can access vehicles assigned to their own collector profile and only while the company has active district authorization.
- Household roles are denied fleet/device endpoints.

Device management mutations also verify the enrolled device's current resource scope; knowing another device's database ID is insufficient.

## Hardware and deployment work remaining

- Enroll and verify a real GPS tracker, provision its credential securely, and confirm a successful HTTPS ingestion.
- Confirm each device's speed units, heading convention, accuracy units, timestamp source, and retry behavior before production use.
- Configure online timeout for the deployment and HTTPS/network allow-listing as appropriate.
- MQTT is not implemented. The current supported transport is HTTPS REST with per-device credentials. A broker, TLS, per-device ACLs, reconnect policy, and broker credential rotation would require a separately configured deployment.

## Verification

- Migration `011_gps_iot_devices.sql` applied successfully to the configured PostgreSQL development/test database.
- Backend suite: 98 passed.
- Frontend suite: 6 passed; production type-check/build passed.
- Frontend lint exited successfully with a warning in the untouched `src/context/AuthContext.tsx`.
- No live GPS device has sent data; real-device operation remains unverified.
