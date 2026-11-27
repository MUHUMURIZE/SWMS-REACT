const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createHash, randomBytes } = require("node:crypto");
const { pool } = require("../config/db");
const { errorHandler } = require("../middleware/errorMiddleware");

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
const trackingRoutes = require("../routes/trackingRoutes");
const iotRoutes = require("../routes/iotRoutes");
const { GpsSimulator } = require("../simulators/gpsSimulator");
const { IotSimulator } = require("../simulators/iotSimulator");
test.after(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function createDevice(id, type, resourceId) {
  return {
    id,
    deviceCode: `SIM-${type}-${id}`,
    deviceType: type,
    vehicleId: type === "GPS" ? resourceId : null,
    binId: type === "BIN" ? resourceId : null,
    status: "ACTIVE",
    isSimulated: true,
    credential: randomBytes(32).toString("hex"),
  };
}

function createTelemetryStore(t, devices) {
  const credentialsByHash = new Map(
    devices.map((device) => [
      createHash("sha256").update(device.credential).digest("hex"),
      device,
    ])
  );
  const store = { locations: [], readings: [], binUpdates: [] };

  t.mock.method(pool, "query", async (sql, values = []) => {
    if (sql.includes("FROM resource_devices") && sql.includes("WHERE credential_hash")) {
      const device = credentialsByHash.get(values[0]);
      return {
        rows: device
          ? [{ id: device.id, deviceType: device.deviceType, isSimulated: device.isSimulated }]
          : [],
      };
    }
    throw new Error(`Unexpected simulator authentication query: ${sql}`);
  });

  t.mock.method(pool, "connect", async () => ({
    async query(sql, values = []) {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      if (sql.includes("FROM resource_devices") && sql.includes("FOR UPDATE")) {
        const device = devices.find((item) => item.id === values[0] && item.deviceType === values[1]);
        return { rows: device ? [device] : [] };
      }
      if (sql.includes("INSERT INTO vehicle_locations")) {
        store.locations.push({
          deviceId: values[0],
          vehicleId: values[1],
          messageId: values[2],
          latitude: values[3],
          longitude: values[4],
          isSimulated: values[9],
        });
        return { rows: [{ id: store.locations.length, receivedAt: new Date().toISOString() }] };
      }
      if (sql.includes("SELECT measured_at AS \"measuredAt\" FROM bin_sensor_readings")) {
        const latest = store.readings
          .filter((reading) => reading.binId === values[0])
          .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt))[0];
        return { rows: latest ? [{ measuredAt: latest.measuredAt }] : [] };
      }
      if (sql.includes("INSERT INTO bin_sensor_readings")) {
        const reading = {
          deviceId: values[0],
          binId: values[1],
          messageId: values[2],
          fillLevel: values[3],
          batteryLevel: values[4],
          sensorStatus: values[5],
          overflowDetected: values[6],
          measuredAt: values[7],
          isSimulated: values[8],
        };
        store.readings.push(reading);
        return { rows: [{ id: store.readings.length, receivedAt: new Date().toISOString() }] };
      }
      if (sql.includes("UPDATE waste_bins SET fill_level")) {
        store.binUpdates.push({ fillLevel: values[0], status: values[1], binId: values[2] });
        return { rows: [] };
      }
      if (sql.includes("UPDATE resource_devices SET last_communication_at")) return { rows: [] };
      throw new Error(`Unexpected simulator ingestion query: ${sql}`);
    },
    release() {},
  }));
  return store;
}

test("GPS and IoT simulators ingest test data through the real HTTP routes", async (t) => {
  const gpsDevices = [createDevice(81, "GPS", 181), createDevice(82, "GPS", 182)];
  const binDevices = [createDevice(91, "BIN", 191), createDevice(92, "BIN", 192)];
  const store = createTelemetryStore(t, [...gpsDevices, ...binDevices]);
  const app = express();
  app.use(express.json());
  app.use("/api/tracking", trackingRoutes);
  app.use("/api/iot", iotRoutes);
  app.use(errorHandler);

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const apiBaseUrl = `http://127.0.0.1:${server.address().port}`;

  const gps = new GpsSimulator({
    apiBaseUrl,
    intervalMs: 1000,
    devices: gpsDevices.map((device, index) => ({
      ...device,
      route: [
        { latitude: -1.94 - index * 0.01, longitude: 30.06 },
        { latitude: -1.95 - index * 0.01, longitude: 30.07 },
      ],
    })),
  });
  const iot = new IotSimulator({
    apiBaseUrl,
    intervalMs: 1000,
    devices: binDevices.map((device, index) => ({
      ...device,
      initialFillLevel: index === 0 ? 75 : 90,
    })),
  });

  const gpsResults = await Promise.all(
    gpsDevices.map((device) => gps.sendUpdateForDevice(device.deviceCode))
  );
  assert.ok(gpsResults.every((result) => result.response.status === 202));
  assert.equal(store.locations.length, 2);
  assert.ok(store.locations.every((location) => location.isSimulated));
  assert.ok(store.locations.every((location) => Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)));

  iot.configureDevice(binDevices[1].deviceCode, { fillLevel: 100 });
  const iotResults = await Promise.all(
    binDevices.map((device) => iot.sendReadingForDevice(device.deviceCode))
  );
  assert.ok(iotResults.every((result) => result.response.status === 202));
  assert.deepEqual(store.readings.map((reading) => reading.fillLevel), [75, 100]);
  assert.ok(store.readings.every((reading) => reading.isSimulated));
  assert.deepEqual(store.binUpdates.map((update) => update.status), ["MEDIUM", "FULL"]);

  gps.setDeviceInterrupted(gpsDevices[0].deviceCode, true);
  const gpsCount = store.locations.length;
  assert.equal((await gps.sendUpdateForDevice(gpsDevices[0].deviceCode)).skipped, true);
  assert.equal(store.locations.length, gpsCount);
  gps.setDeviceInterrupted(gpsDevices[0].deviceCode, false);
  assert.equal(
    (await gps.sendUpdateForDevice(gpsDevices[0].deviceCode)).response.status,
    202
  );
  assert.equal(store.locations.length, gpsCount + 1);
});

test("simulators reject production mode, remote targets, and invalid device records", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.throws(() => new GpsSimulator({ devices: [] }), /disabled in production/i);
  process.env.NODE_ENV = "test";
  try {
    assert.throws(
      () => new IotSimulator({ apiBaseUrl: "https://example.com", devices: [] }),
      /loopback development hosts/i
    );
    assert.throws(
      () => new GpsSimulator({
        devices: [{ deviceCode: "SIM-GPS-1", isSimulated: true, credential: "invalid", vehicleId: 1 }],
      }),
      /valid device credential/i
    );
    assert.throws(() => new IotSimulator({ intervalMs: 499, devices: [] }), /500 and 300000/i);

    const device = createDevice(101, "BIN", 201);
    const simulator = new IotSimulator({ devices: [device] });
    assert.throws(
      () => simulator.configureDevice(device.deviceCode, { interrupted: "false" }),
      /interrupted must be a boolean/i
    );
    assert.throws(
      () => simulator.configureDevice(device.deviceCode, { overflowDetected: "false" }),
      /overflowDetected must be a boolean or null/i
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
