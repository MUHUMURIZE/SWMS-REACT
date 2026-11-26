# Smart-bin IoT backend implementation

## Status

The backend now supports smart-device enrollment and revocation, bin association, authenticated telemetry ingestion, reading history, latest sensor state, communication status, and active alert retrieval. No physical sensor or identified test device has sent data through this implementation; live IoT operation is not verified.

## Database and migrations

Migration `swms-backend/database/migrations/011_gps_iot_devices.sql` adds:

- A shared `resource_devices` table with hashed credentials, GPS/BIN type, one active resource association, revocation, and last communication time.
- `bin_sensor_readings` with fill level, optional battery, sensor status, optional sensor-reported overflow, measured/received timestamps, and per-device message deduplication.
- Bin/time and device/receive-time indexes, plus a partial overflow index.

Telemetry writes, bin fill/status updates, and device communication updates run in a transaction. The existing `waste_bins.fill_level` and status model remains intact. Valid sensor fill levels are integer percentages from 0 to 100 and map to the existing statuses: `EMPTY` at 0, `LOW` from 1–49, `MEDIUM` from 50–79, `HIGH` from 80–99, and `FULL` at 100.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/iot/devices` | Register a bin sensor and issue its credential once |
| `GET` | `/api/iot/devices` | List company-scoped sensor devices |
| `PUT` | `/api/iot/devices/:id/bin` | Associate a sensor to an authorized bin |
| `POST` | `/api/iot/devices/:id/rotate-credential` | Rotate its hardware credential |
| `DELETE` | `/api/iot/devices/:id` | Revoke it |
| `POST` | `/api/iot/ingest` | Ingest device-authenticated telemetry |
| `GET` | `/api/iot/bins/:binId/latest` | Get latest telemetry and device state |
| `GET` | `/api/iot/bins/:binId/readings` | Get paginated sensor history |
| `GET` | `/api/iot/alerts` | Get active full, overflow, sensor-fault, and offline-device alerts |

Protected management/read endpoints require a user bearer JWT and server-side authorization. History, device, and alert lists accept `limit` (1–200, default 50) and `offset` (default 0). Resource IDs in URLs are checked against the caller's company/district or collector assignment; client-supplied company/district ownership is not trusted.

## Hardware-dependent fields and alerts

The ingestion contract requires `messageId`, integer `fillLevel`, `sensorStatus` (`OK`, `DEGRADED`, or `FAULT`), and `measuredAt`. `batteryLevel` is optional and is stored only when the actual unit reports a percentage.

`overflowDetected` is optional and must be omitted unless the installed hardware has a dedicated overflow sensor. Overflow is never inferred from fill percentage. A `FULL` alert is based on an actual 100% reading; `SENSOR_FAULT` follows a reported fault state; `DEVICE_OFFLINE` is computed when an active enrolled device has not communicated within `DEVICE_ONLINE_WINDOW_SECONDS` (default 300 seconds). No alert is fabricated for an unenrolled bin.

The bin status is updated only when an accepted reading is at least as recent as the current latest sensor measurement. Historical delayed readings are retained but cannot overwrite the latest bin status. Duplicate message IDs with identical content are idempotent; changed content with the same ID returns `409`.

## Security and transport

Device credentials are 256-bit random values returned once at registration and stored as SHA-256 hashes. Ingestion uses `X-Device-Credential`, not a user JWT; the device's assigned bin is resolved on the server. Rotation invalidates the previous credential, revocation disables ingestion, and management events are audited. Deploy over HTTPS and securely provision/store credentials; never expose them in frontend code.

No MQTT broker is configured or included. HTTPS REST is the implemented transport. MQTT over TLS with device identities, topic ACLs, broker-side schema limits, reconnection behavior, and credential rotation remains a deployment choice and is not represented as active.

## Hardware and deployment work remaining

- Confirm the actual sensor provides fill percentage and an `OK`/`DEGRADED`/`FAULT` health state.
- Only enable battery reporting when the specific hardware provides a percentage.
- Only send `overflowDetected` when a dedicated overflow sensor is installed and tested.
- Provision a real unit and verify successful authenticated ingestion and calibrated readings before claiming live monitoring.
- Configure HTTPS, network controls, and the communication freshness threshold for the deployment.

## Verification

- Migration `011_gps_iot_devices.sql` applied successfully to the configured PostgreSQL development/test database.
- Backend suite: 98 passed.
- Frontend suite: 6 passed; production type-check/build passed.
- Frontend lint exited successfully with a warning in the untouched `src/context/AuthContext.tsx`.
- No live or identified test sensor has sent telemetry; real-device operation remains unverified.
