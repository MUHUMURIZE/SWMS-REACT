const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const districtAuthorizationService = require("../services/districtAuthorizationService");
const deviceService = require("../services/deviceService");
const AppError = require("../utils/AppError");

function locationTimestamp(offsetMs = -1000) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createTelemetryPool(t) {
  const state = { readings: [], fillLevel: null, binStatus: null, deviceWrites: 0 };
  let lockTail = Promise.resolve();
  t.mock.method(pool, "connect", async () => {
    let unlock;
    const client = {
      async query(sql, values = []) {
        if (sql === "BEGIN") return { rows: [] };
        if (sql === "COMMIT" || sql === "ROLLBACK") {
          if (unlock) unlock();
          return { rows: [] };
        }
        if (sql.includes("FROM resource_devices") && sql.includes("FOR UPDATE")) {
          const previous = lockTail;
          lockTail = new Promise((resolve) => { unlock = resolve; });
          await previous;
          return {
            rows: [{
              id: 8,
              deviceCode: "sensor-8",
              deviceType: "BIN",
              vehicleId: null,
              binId: 23,
              status: "ACTIVE",
              lastCommunicationAt: null,
              createdBy: 1,
            }],
          };
        }
        if (sql.includes('SELECT measured_at AS "measuredAt" FROM bin_sensor_readings')) {
          const latest = state.readings
            .slice()
            .sort((left, right) => new Date(right.measuredAt) - new Date(left.measuredAt))[0];
          return { rows: latest ? [{ measuredAt: latest.measuredAt }] : [] };
        }
        if (sql.includes("INSERT INTO bin_sensor_readings")) {
          const existing = state.readings.find((reading) => reading.messageId === values[2]);
          if (existing) return { rows: [] };
          const reading = {
            deviceId: values[0],
            binId: values[1],
            messageId: values[2],
            fillLevel: values[3],
            batteryLevel: values[4],
            sensorStatus: values[5],
            overflowDetected: values[6],
            measuredAt: values[7],
            receivedAt: locationTimestamp(),
          };
          state.readings.push(reading);
          return { rows: [{ id: state.readings.length, receivedAt: reading.receivedAt }] };
        }
        if (sql.includes("FROM bin_sensor_readings WHERE device_id = $1 AND message_id = $2")) {
          const reading = state.readings.find((item) => item.deviceId === values[0] && item.messageId === values[1]);
          return { rows: reading ? [{
            binId: reading.binId,
            fillLevel: reading.fillLevel,
            batteryLevel: reading.batteryLevel,
            sensorStatus: reading.sensorStatus,
            overflowDetected: reading.overflowDetected,
            measuredAt: reading.measuredAt,
            receivedAt: reading.receivedAt,
          }] : [] };
        }
        if (sql.includes("UPDATE waste_bins SET fill_level")) {
          state.fillLevel = values[0];
          state.binStatus = values[1];
          return { rows: [] };
        }
        if (sql.includes("UPDATE resource_devices SET last_communication_at")) {
          state.deviceWrites += 1;
          return { rows: [] };
        }
        throw new Error(`Unexpected telemetry query: ${sql}`);
      },
      release() {},
    };
    return client;
  });
  return state;
}

test("offline state and fill-level status use explicit thresholds", () => {
  const now = Date.now();
  assert.equal(deviceService.onlineStatus(new Date(now - 60_000), now), "ONLINE");
  assert.equal(deviceService.onlineStatus(new Date(now - 301_000), now), "OFFLINE");
  assert.equal(deviceService.onlineStatus(null, now), "OFFLINE");
  assert.equal(deviceService.statusForFillLevel(0), "EMPTY");
  assert.equal(deviceService.statusForFillLevel(49), "LOW");
  assert.equal(deviceService.statusForFillLevel(50), "MEDIUM");
  assert.equal(deviceService.statusForFillLevel(80), "HIGH");
  assert.equal(deviceService.statusForFillLevel(100), "FULL");
});

test("valid bin telemetry is persisted and updates the bin status transactionally", async (t) => {
  const state = createTelemetryPool(t);
  const result = await deviceService.ingestTelemetry(
    { id: 8, deviceType: "BIN" },
    {
      messageId: "reading-1",
      fillLevel: 100,
      batteryLevel: 70,
      sensorStatus: "OK",
      measuredAt: locationTimestamp(),
    }
  );
  assert.equal(result.duplicate, false);
  assert.equal(state.readings.length, 1);
  assert.equal(state.fillLevel, 100);
  assert.equal(state.binStatus, "FULL");
});

test("valid GPS updates are tied to the device's vehicle association", async (t) => {
  const locations = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql, values = []) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM resource_devices") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: 8,
            deviceCode: "gps-8",
            deviceType: "GPS",
            vehicleId: 44,
            binId: null,
            status: "ACTIVE",
            lastCommunicationAt: null,
            createdBy: 1,
          }],
        };
      }
      if (sql.includes("INSERT INTO vehicle_locations")) {
        locations.push(values);
        return { rows: [{ id: 1, receivedAt: locationTimestamp() }] };
      }
      if (sql.includes("UPDATE resource_devices SET last_communication_at")) return { rows: [] };
      throw new Error(`Unexpected GPS ingestion query: ${sql}`);
    },
    release() {},
  }));
  const result = await deviceService.ingestLocation(
    { id: 8, deviceType: "GPS" },
    {
      messageId: "gps-8-1",
      latitude: 12.1234567,
      longitude: -3.1234567,
      speed: 25.5,
      recordedAt: locationTimestamp(),
    }
  );
  assert.equal(result.vehicleId, 44);
  assert.equal(result.duplicate, false);
  assert.equal(locations[0][1], 44);
  assert.equal(locations[0][3], 12.1234567);
});

test("duplicate telemetry is idempotent and conflicting message identifiers are rejected", async (t) => {
  const state = createTelemetryPool(t);
  const device = { id: 8, deviceType: "BIN" };
  const telemetry = {
    messageId: "reading-duplicate",
    fillLevel: 80,
    sensorStatus: "OK",
    measuredAt: locationTimestamp(),
  };
  await deviceService.ingestTelemetry(device, telemetry);
  const duplicate = await deviceService.ingestTelemetry(device, telemetry);
  assert.equal(duplicate.duplicate, true);
  assert.equal(state.readings.length, 1);
  await assert.rejects(
    deviceService.ingestTelemetry(device, { ...telemetry, fillLevel: 90 }),
    (error) => error.statusCode === 409
  );
  assert.equal(state.readings.length, 1);
});

test("concurrent out-of-order telemetry cannot replace a newer bin reading", async (t) => {
  const state = createTelemetryPool(t);
  const device = { id: 8, deviceType: "BIN" };
  await Promise.all([
    deviceService.ingestTelemetry(device, {
      messageId: "reading-old",
      fillLevel: 20,
      sensorStatus: "OK",
      measuredAt: locationTimestamp(-2000),
    }),
    deviceService.ingestTelemetry(device, {
      messageId: "reading-new",
      fillLevel: 90,
      sensorStatus: "OK",
      measuredAt: locationTimestamp(-1000),
    }),
  ]);
  assert.equal(state.readings.length, 2);
  assert.equal(state.fillLevel, 90);
  assert.equal(state.binStatus, "HIGH");
});

test("company representatives cannot read vehicles outside their company", async (t) => {
  t.mock.method(pool, "query", async (sql) => {
    if (sql.includes("FROM fleet_vehicles")) {
      return { rows: [{ id: 44, companyId: 99, collectorId: null, district: null, districtMatches: true }] };
    }
    if (sql.includes("FROM representatives")) return { rows: [{ company_id: 7 }] };
    throw new Error(`Unexpected authorization query: ${sql}`);
  });
  await assert.rejects(
    deviceService.latestLocation({ id: 2, role: "COMPANY_REPRESENTATIVE" }, 44),
    (error) => error.statusCode === 404
  );
});

test("collectors cannot read a vehicle assigned to another collector", async (t) => {
  t.mock.method(pool, "query", async (sql) => {
    if (sql.includes("FROM fleet_vehicles")) {
      return { rows: [{ id: 44, companyId: 7, collectorId: 22, district: "District A", districtMatches: true }] };
    }
    if (sql.includes("FROM collectors")) return { rows: [{ id: 11 }] };
    throw new Error(`Unexpected authorization query: ${sql}`);
  });
  await assert.rejects(
    deviceService.latestLocation({ id: 2, role: "COLLECTOR" }, 44),
    (error) => error.statusCode === 404
  );
});

test("company representatives cannot read bins in an unauthorized district", async (t) => {
  t.mock.method(pool, "query", async (sql) => {
    if (sql.includes("FROM waste_bins b")) {
      return { rows: [{
        id: 12,
        companyId: 7,
        collectorId: 4,
        district: "District A",
        collectorDistrict: "District A",
        districtMatches: true,
      }] };
    }
    if (sql.includes("FROM representatives")) return { rows: [{ company_id: 7 }] };
    throw new Error(`Unexpected authorization query: ${sql}`);
  });
  t.mock.method(districtAuthorizationService, "companyCanOperateInDistrict", async () => false);
  await assert.rejects(
    deviceService.latestBinReading({ id: 2, role: "COMPANY_REPRESENTATIVE" }, 12),
    (error) => error.statusCode === 404
  );
});

test("location history validates vehicle scope and returns recorded entries", async (t) => {
  const history = [{
    id: 1,
    deviceId: 8,
    vehicleId: 44,
    messageId: "gps-history-1",
    latitude: "12.1234567",
    longitude: "-3.1234567",
    speed: "25.50",
    heading: null,
    accuracy: "6.00",
    recordedAt: locationTimestamp(),
    receivedAt: locationTimestamp(),
  }];
  t.mock.method(pool, "query", async (sql) => {
    if (sql.includes("FROM fleet_vehicles")) {
      return { rows: [{ id: 44, companyId: 1, collectorId: null, district: null, districtMatches: true }] };
    }
    if (sql.includes("FROM vehicle_locations WHERE vehicle_id")) return { rows: history };
    throw new Error(`Unexpected history query: ${sql}`);
  });
  const result = await deviceService.locationHistory({ id: 1, role: "ADMIN" }, 44, { limit: 10, offset: 0 });
  assert.equal(result.length, 1);
  assert.equal(result[0].latitude, 12.1234567);
  assert.equal(result[0].speed, 25.5);
  assert.equal(result[0].heading, null);
});

test("hardware credentials cannot be used for the wrong ingestion type", async () => {
  await assert.rejects(
    deviceService.ingestLocation({ id: 8, deviceType: "BIN" }, {
      messageId: "wrong-device-kind",
      latitude: 0,
      longitude: 0,
      recordedAt: locationTimestamp(),
    }),
    (error) => error instanceof AppError && error.statusCode === 403
  );
});
