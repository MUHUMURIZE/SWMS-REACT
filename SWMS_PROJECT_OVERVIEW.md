# Smart Waste Management System (SWMS) — Project Overview

## 1. System Vision & Architecture
SWMS is an enterprise-grade national waste management SaaS platform engineered for multi-tenant solid waste operations across administrative jurisdictions (Districts, Sectors, Cells, Villages). The platform supports real-time telemetry, automated dispatching, route navigation, and regulatory audit compliance.

```
+-----------------------------------------------------------------------------------+
|                                   SWMS Platform                                   |
+-----------------------------------------------------------------------------------+
|  Frontend: React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query + Leaflet |
+-----------------------------------------------------------------------------------+
                                      ▲ (HTTPS / JWT)
                                      ▼
+-----------------------------------------------------------------------------------+
| Backend: Node.js (v20+) + Express + PostgreSQL (Pool) + Redis + Winston + Joi     |
|   - Multi-tenant Role-Based Access Control (RBAC)                                 |
|   - Cryptographic Hardware Authentication (SHA-256 / Device Code)                 |
|   - Dynamic Geo-coordinates & Automated Proximity Dispatching                     |
|   - OpenAPI 3.0 / Swagger Interactive Documentation (`/api-docs`)                 |
+-----------------------------------------------------------------------------------+
          ▲                                                   ▲
          | (Hardware Ingestion API)                          | (Hardware Ingestion API)
+------------------------+                         +------------------------+
|  Vehicle GPS Trackers  |                         | Smart Waste Bins (IoT) |
| (SIM-GPS-01, SIM-02)   |                         | Ultrasonic + Battery   |
+------------------------+                         +------------------------+
```

---

## 2. Multi-Role Hierarchy & Access Boundaries

| Role | Scope & Permissions | Key Modules Accessible |
| :--- | :--- | :--- |
| **ADMIN** | National scope. Full administrative oversight, company licensing, district operating agreements, global fleet, audit trails, and device revocation. | All dashboards, District Agreements, Companies, Users, Global Telemetry, System Audit Logs. |
| **COMPANY_REPRESENTATIVE** | Company-scoped. Manages contracted district agreements, company vehicles, assigned collectors, collection performance metrics, and device rotations. | Fleet Management, Company Collectors, Assigned Districts, Collections, Route Telemetry. |
| **COLLECTOR** | Field-level assigned scope. Executes scheduled collections, updates waste bin statuses, navigates optimized routes to bins, views assigned vehicle telemetry. | Collector Route Map, Direct Turn-by-Turn Navigation, Bin Geo-tagging, Task Completion. |
| **HOUSEHOLD** | Citizen-level single household scope. Views assigned waste bin status, historical pickups, issues collection requests, reviews service notifications. | Household Dashboard, Smart Bin Status, Direct Service Requests. |

---

## 3. Technology Stack & Key Libraries

### Backend
- **Runtime:** Node.js (ES2022 / CommonJS), Express.js.
- **Database:** PostgreSQL with native `pg` connection pooling and strictly isolated transactional operations (`BEGIN ... COMMIT / ROLLBACK`).
- **Security & Hardening:**
  - JWT (JSON Web Tokens) with RS256/HS256 validation and `token_version` revocation.
  - BCrypt password hashing (10 salt rounds).
  - SHA-256 hexadecimal device token hashing with per-device rotation.
  - Redis-backed distributed rate limiting with sliding IP + identity windows.
  - Strict input sanitization via Joi schemas rejecting unexpected fields.

### Frontend
- **Framework:** React 18 with Vite and TypeScript (`strict: true`).
- **Styling:** Tailwind CSS with Lucide React iconography.
- **State Management & Network:** TanStack Query (React Query) for optimistic updates and caching; Axios with automated JWT injection and refresh handling.
- **Mapping & Geospatial:** Leaflet and React-Leaflet with custom SVG status pins, dynamic viewport fitting, and Google Maps deep navigation links.

---

## 4. Hardware Telemetry & Geo Integration

### Vehicle GPS Tracking
- **Endpoints:** `POST /api/gps/telemetry` (hardware ingestion), `GET /api/gps/vehicles/latest`, `GET /api/gps/vehicles/:id/history`.
- **Authentication:** Dual-header hardware verification (`x-device-code`, `x-device-credential`).
- **Features:** In-motion tracking, historical route rendering, speed and bearing telemetry, and operational status management (`IN_SERVICE`, `MAINTENANCE`, `OUT_OF_SERVICE`).

### Smart Waste Bins & Household Geolocation
- **Endpoints:** `POST /api/iot/telemetry`, `GET /api/iot/devices/latest`, `PUT /api/bins/:id/location`.
- **GPS Coordinates Without Tracker:** Households and standard waste bins capture accurate coordinates (`latitude`, `longitude`, `location_accuracy`, `location_captured_at`) via the collector or citizen device during onboarding or inspection.
- **IoT Sensors:** Smart bins with ultrasonic sensors stream fill level (0–100%), battery voltage, temperature, and tilt alarms. Fill status transitions atomically (`EMPTY` -> `LOW` -> `MEDIUM` -> `HIGH` -> `FULL`).

---

## 5. Development Simulators
Located in `swms-backend/simulators/`, guarded by `guard.js`:
- Strictly disabled in production (`NODE_ENV === "production"` rejects execution).
- Uses isolated loopback database and test prefixes (`SIM-*`).
- Real-time vehicle navigation simulation over Kigali coordinates.
- Multi-scenario smart-bin filling, battery drain, and offline fault simulation.
- Controllable via CLI or in-app via the `/dev-simulator` route.
