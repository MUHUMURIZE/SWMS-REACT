# SWMS GPS & IoT Telemetry — Test Verification Report

## 1. Test Suite Summary
All automated backend unit, integration, and security tests were executed against the PostgreSQL database.

- **Total Test Cases:** 106
- **Passed:** 106
- **Failed:** 0
- **Duration:** ~14.4 seconds
- **Database Engine:** PostgreSQL 16 (local loopback connection)

---

## 2. Test Verification Matrix

| Category | Test Description | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| **Hardware Auth** | SHA-256 hashed device credentials verification | Unit & Integration Test | **PASS** |
| **Hardware Auth** | Rejection of malformed/missing/invalid device credentials | Unit & Integration Test | **PASS** |
| **Hardware Auth** | Prevention of cross-device credential impersonation | Unit & Integration Test | **PASS** |
| **GPS Ingestion** | Ingestion of vehicle coordinates, speed, heading, accuracy | End-to-End API Test | **PASS** |
| **GPS Ingestion** | Historical route retrieval scoped by company authorization | RBAC Integration Test | **PASS** |
| **IoT Ingestion** | Transactional fill-level telemetry persistence | Database Integration Test | **PASS** |
| **IoT Ingestion** | Out-of-order reading rejection and idempotency | Concurrency Test | **PASS** |
| **IoT Status** | Automatic status recalculation (`EMPTY`, `LOW`, `MEDIUM`, `HIGH`, `FULL`) | State Transition Test | **PASS** |
| **IoT Alerts** | Threshold notifications trigger at 80%, 90%, and 100% | Business Logic Test | **PASS** |
| **Bin Geo-Capture** | Update bin location via `PUT /api/bins/:id/location` | API Validation Test | **PASS** |
| **Household Geo** | Geo-coordinates cascade from household to auto-provisioned bin | Migration 012 Verification | **PASS** |
| **Simulator Ingestion** | Live HTTP transmission via real `/api/tracking/ingest` and `/api/iot/ingest` | Live End-to-End Test (HTTP 202) | **PASS** |
| **Simulator Guard**| Strict rejection of simulated devices in production mode | Guard Module Test | **PASS** |
| **Frontend Build** | TypeScript compilation (`tsc -b`) and Vite production bundle | Build Verification | **PASS** |

---

## 3. Simulator Integration Verification

### Verification Scenario 1: GPS Vehicle Simulation
- **Target Device:** `SIM-GPS-01` attached to `SIM-VEH-01`, and `SIM-GPS-02` attached to `SIM-VEH-02`.
- **Action:** Executed live simulator HTTP step transmitting real Kigali coordinates, speed (22 km/h), bearing, and accuracy.
- **Outcome:** HTTP status `202 Accepted` returned from `/api/tracking/ingest`. Telemetry persisted to `vehicle_locations` table with `is_simulated = true`. The latest vehicle position query immediately reflects moving position on Leaflet map in `GPSTrackingPage`.

### Verification Scenario 2: IoT Smart Bin Fill Level & Alert Thresholds
- **Target Device:** `SIM-IOT-01`, `SIM-IOT-02`, and `SIM-IOT-03` attached to bins `SIM-BIN-01`, `02`, `03`.
- **Action:** Transmitted fill level progression (30%, 75%, 90%) with battery telemetry (92%) and sensor health `OK`.
- **Outcome:** HTTP status `202 Accepted` returned from `/api/iot/ingest`. Records stored in `bin_sensor_readings` with `is_simulated = true`. Statuses recalculated and threshold notifications created when crossing 80% and 90%.

### Verification Scenario 3: Bin Geolocation Capture Without Hardware Tracker
- **Target Bin:** Standard bin `SIM-BIN-04` (household without IoT sensor).
- **Action:** Executed `PUT /api/bins/:id/location` with latitude `-1.951200`, longitude `30.059400`, accuracy `5.0`.
- **Outcome:** Coordinates saved to `waste_bins` table. Bin appeared on collector route map with Google Maps navigation link.
