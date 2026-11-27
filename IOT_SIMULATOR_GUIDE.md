# SWMS IoT Smart-Bin Simulator Guide

## 1. Overview
The SWMS IoT subsystem collects real-time fill level telemetry and diagnostic health from ultrasonic sensors installed in smart waste bins.

The IoT simulator (`swms-backend/simulators/iotSimulator.js`) allows developers to test fill level progression, automated critical threshold notifications (80%, 90%, 100%), battery drain alerts, sensor faults, and tamper/lid tilt states without requiring physical sensor hardware.

---

## 2. Architecture & Safety Guards

- **Strict Environment Checks:** Only runs when `NODE_ENV !== "production"`.
- **Credential Storage:** Devices authenticate using device code and SHA-256 hashed hardware secrets.
- **Auditing & Simulation Isolation:** Records `is_simulated = true` on all generated sensor rows, strictly preventing test data contamination.
- **Atomic Threshold Evaluations:** Progresses fill levels transactionally; triggers notifications when crossing 80%, 90%, and 100% fill levels.

---

## 3. Getting Started

### Step 1: Initialize the Simulation Environment
Ensure the simulation environment is seeded:
```bash
cd swms-backend
npm run sim:setup
```
This registers smart bins `SIM-BIN-01`, `SIM-BIN-02`, and `SIM-BIN-03` equipped with IoT sensors `SIM-IOT-01`, `SIM-IOT-02`, and `SIM-IOT-03`.

### Step 2: Run the IoT Simulator via CLI
To start streaming simulated bin telemetry:
```bash
npm run sim:iot
```

#### CLI Options & Modes:
- `--bin=SIM-BIN-01` : Target specific smart bin.
- `--interval=5000` : Telemetry update cadence in milliseconds (default: 5000ms).
- `--mode=normal` : Gradual realistic waste accumulation (+1% to +3% per reading).
- `--preset=95` : Instantly jump fill level to 95% to test full-bin alert triggers.
- `--battery=15` : Simulate low battery condition (< 20%) to trigger maintenance alerts.
- `--fault=SENSOR_FAILURE` : Transmit sensor error state (`OK`, `DEGRADED`, `FAULT`).
- `--offline` : Simulate communications timeout / missing readings.

### Step 3: Run the IoT Simulator via the Web UI
1. Navigate to **Dev Simulator** (`/dev-simulator`).
2. In the **Smart Bin IoT Simulators** section, find `SIM-BIN-01` or `SIM-BIN-02`.
3. Click preset buttons to test:
   - **Empty (10%)**
   - **Half Full (50%)**
   - **Near Full (85%)** — triggers warning notification.
   - **Critical (95%)** — triggers urgent collection notification.
   - **Full (100%)** — marks bin status as `FULL` on the map and dispatches collector.
   - **Low Battery (12%)** — triggers hardware maintenance ticket.
4. Open **IoT Devices** (`/devices`) or **Dashboard** to see the colored pin update dynamically on the map and the alert feed pop up.

---

## 4. Hardware Telemetry Ingestion API Reference

### Ingestion Request
- **Method:** `POST`
- **Path:** `/api/iot/telemetry`
- **Headers:**
  - `Content-Type: application/json`
  - `x-device-code: SIM-IOT-01`
  - `x-device-credential: <plain-text-rotated-credential>`

### Payload Schema
```json
{
  "fillLevel": 88.5,
  "batteryLevel": 82.0,
  "temperature": 24.5,
  "tiltDetected": false,
  "sensorHealth": "OK",
  "recordedAt": "2026-11-27T01:30:00.000Z"
}
```

### Ingestion Response
```json
{
  "status": "success",
  "binId": 45,
  "binStatus": "HIGH",
  "notificationsCreated": 1,
  "isSimulated": true
}
```

---

## 5. Waste Bin Geolocation (Without Tracker)
For non-smart bins and households without GPS hardware trackers:
1. Collectors or citizens open **Waste Bins** under **Resources** (`/resources`).
2. Click the **Update Location** pin action on any bin record.
3. The app invokes the browser's high-accuracy Geolocation API (`navigator.geolocation.getCurrentPosition`).
4. Captured latitude, longitude, and accuracy radius are saved directly to the bin record via `PUT /api/bins/:id/location`.
5. The bin is immediately rendered on collector navigation maps.
