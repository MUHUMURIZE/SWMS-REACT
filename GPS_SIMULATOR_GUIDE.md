# SWMS GPS Tracking & Simulator Guide

## 1. Overview
The SWMS GPS subsystem tracks waste collection vehicles in real time, logs historical paths, and assists collectors in navigating to households and waste bins across assigned administrative zones.

For local development and testing, SWMS provides a realistic GPS vehicle simulator (`swms-backend/simulators/gpsSimulator.js`) that emits telemetry over HTTP directly to the backend ingestion API using valid hardware credentials.

---

## 2. Architecture & Safety Guards

```
+--------------------------------------------------------------------+
|                    Development Safety Guard                         |
|  - Strictly rejects execution if NODE_ENV === 'production'         |
|  - Verifies host is loopback (localhost, 127.0.0.1, ::1)          |
|  - Verifies database is local SWMS test instance                   |
|  - Enforces `is_simulated = TRUE` on test records and telemetry    |
+--------------------------------------------------------------------+
                                  │
                                  ▼
+-----------------------+     HTTP POST      +-----------------------+
|  GPS Vehicle Tracker  | ─────────────────> | SWMS Backend API      |
|  (gpsSimulator.js)    | /api/gps/telemetry | (Device Auth Guard)   |
+-----------------------+                    +-----------------------+
```

---

## 3. Getting Started

### Step 1: Initialize the Simulation Environment
Run the test environment setup script to create isolated test companies, districts, collectors, vehicles (`SIM-VEH-01`, `SIM-VEH-02`), and registered GPS devices:
```bash
cd swms-backend
npm run sim:setup
```
This generates credentials safely saved in `swms-backend/.sim-state.json` (gitignored).

### Step 2: Run the GPS Simulator via CLI
To start emitting GPS coordinates for vehicle `SIM-VEH-01` along a realistic Kigali route:
```bash
npm run sim:gps
```

#### CLI Options & Flags:
- `--vehicle=SIM-VEH-01` : Select specific test vehicle (`SIM-VEH-01` or `SIM-VEH-02`).
- `--interval=3000` : Telemetry update cadence in milliseconds (default: 3000ms).
- `--speed=35` : Vehicle speed in km/h.
- `--steps=50` : Run for 50 waypoints and stop.
- `--pause` : Start paused for step-by-step manual advancement.
- `--offline` : Simulate communications blackout (interrupted GPS transmission).

### Step 3: Run the GPS Simulator via the Web UI
1. Start the backend (`PORT=3000`) and frontend (`PORT=5173`).
2. Log into the SWMS web app (e.g. as `sim-admin@swms-test.local` or any company representative).
3. Navigate to **Dev Simulator** (`/dev-simulator`) in the navigation bar.
4. Under **GPS Vehicle Simulators**, click **Start Vehicle 1** or **Start Vehicle 2**.
5. Switch to **GPS Tracking** (`/tracking`) in another tab to observe the vehicle icon moving smoothly along Kigali roads on the Leaflet map.

---

## 4. Hardware Ingestion API Reference

### Ingestion Request
- **Method:** `POST`
- **Path:** `/api/gps/telemetry`
- **Headers:**
  - `Content-Type: application/json`
  - `x-device-code: SIM-GPS-01`
  - `x-device-credential: <plain-text-rotated-credential>`

### Payload Schema
```json
{
  "latitude": -1.944123,
  "longitude": 30.061945,
  "speed": 34.5,
  "heading": 128.0,
  "accuracy": 4.2,
  "altitude": 1540.0,
  "recordedAt": "2026-11-27T01:30:00.000Z"
}
```

### Ingestion Response
```json
{
  "status": "success",
  "receivedAt": "2026-11-27T01:30:00.120Z",
  "vehicleId": 12,
  "isSimulated": true
}
```

---

## 5. Vehicle Tracking Web UI Features
- **Live Fleet View:** Real-time marker clusters indicating active vehicle positions, speed, and heading.
- **Route History Playback:** Visualizes recorded breadcrumb tracks between dates with color-coded speeds.
- **Device Credential Rotation:** UI for administrators to rotate or revoke vehicle GPS tracker keys with zero downtime.
