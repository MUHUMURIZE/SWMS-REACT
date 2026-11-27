require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const auditModel = require("../models/auditModel");
const deviceService = require("../services/deviceService");
const { assertDevelopmentRuntime, assertLoopbackDatabase } = require("./guard");

const STATE_FILE = path.join(__dirname, "..", ".sim-state.json");

const TEST_DISTRICT_NAME = "[SIM-TEST] Kigali Simulation District";
const TEST_COMPANY_NAME = "[SIM-TEST] EcoTrack Simulation Co.";

const SIM_VEHICLES = [
  {
    key: "SIM-VEH-01",
    registrationNumber: "SIM-VEH-01",
    vehicleType: "COMPACTOR",
    make: "Isuzu",
    model: "SIM-NQR",
    capacity: 8000,
    fuelType: "DIESEL",
    deviceCode: "SIM-GPS-01",
    collectorEmail: "sim-collector-1@swms-test.local",
    route: [
      { latitude: -1.9441, longitude: 30.0619 },
      { latitude: -1.9456, longitude: 30.0642 },
      { latitude: -1.9478, longitude: 30.0685 },
      { latitude: -1.9501, longitude: 30.0660 },
      { latitude: -1.9512, longitude: 30.0594 },
      { latitude: -1.9472, longitude: 30.0581 },
    ],
  },
  {
    key: "SIM-VEH-02",
    registrationNumber: "SIM-VEH-02",
    vehicleType: "TIPPER",
    make: "Fuso",
    model: "SIM-Canter",
    capacity: 5500,
    fuelType: "HYBRID",
    deviceCode: "SIM-GPS-02",
    collectorEmail: "sim-collector-2@swms-test.local",
    route: [
      { latitude: -1.9396, longitude: 30.0648 },
      { latitude: -1.9412, longitude: 30.0695 },
      { latitude: -1.9438, longitude: 30.0721 },
      { latitude: -1.9465, longitude: 30.0698 },
      { latitude: -1.9430, longitude: 30.0645 },
    ],
  },
];

const SIM_HOUSEHOLDS = [
  {
    fullName: "[SIM-TEST] Nyarugenge Household 1",
    email: "sim-household-1@swms-test.local",
    collectorEmail: "sim-collector-1@swms-test.local",
    address: "SIM-01 KN 4 Ave, Kigali",
    sector: "Nyarugenge",
    cell: "Biryogo",
    village: "Sim-Village-A",
    latitude: -1.9441,
    longitude: 30.0619,
    locationAccuracy: 4.5,
    binCode: "SIM-BIN-01",
    sensorDeviceCode: "SIM-IOT-01",
    initialFillLevel: 30,
  },
  {
    fullName: "[SIM-TEST] Nyarugenge Household 2",
    email: "sim-household-2@swms-test.local",
    collectorEmail: "sim-collector-1@swms-test.local",
    address: "SIM-02 KN 12 St, Kigali",
    sector: "Nyarugenge",
    cell: "Kiyovu",
    village: "Sim-Village-B",
    latitude: -1.9478,
    longitude: 30.0685,
    locationAccuracy: 5.2,
    binCode: "SIM-BIN-02",
    sensorDeviceCode: "SIM-IOT-02",
    initialFillLevel: 75,
  },
  {
    fullName: "[SIM-TEST] Nyarugenge Household 3",
    email: "sim-household-3@swms-test.local",
    collectorEmail: "sim-collector-2@swms-test.local",
    address: "SIM-03 KG 7 Ave, Kigali",
    sector: "Kacyiru",
    cell: "Kamatamu",
    village: "Sim-Village-C",
    latitude: -1.9396,
    longitude: 30.0648,
    locationAccuracy: 6.0,
    binCode: "SIM-BIN-03",
    sensorDeviceCode: "SIM-IOT-03",
    initialFillLevel: 90,
  },
  {
    fullName: "[SIM-TEST] Manual Bin Household 4 (No Sensor)",
    email: "sim-household-4@swms-test.local",
    collectorEmail: "sim-collector-1@swms-test.local",
    address: "SIM-04 KN 20 St, Kigali",
    sector: "Nyarugenge",
    cell: "Rwampara",
    village: "Sim-Village-D",
    latitude: -1.9512,
    longitude: 30.0594,
    locationAccuracy: 7.5,
    binCode: "SIM-BIN-04",
    sensorDeviceCode: null,
    initialFillLevel: 10,
  },
];

function readStateFile() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function ensureUser(client, { fullName, email, role, passwordHash }) {
  const existing = await client.query(
    "SELECT id, full_name AS \"fullName\", email, role FROM users WHERE email = $1",
    [email]
  );
  if (existing.rows[0]) return existing.rows[0];
  const created = await client.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name AS "fullName", email, role`,
    [fullName, email, passwordHash, role]
  );
  return created.rows[0];
}

async function ensureDevice(adminUser, type, deviceCode, resourceId, existingCredentials = {}) {
  const existing = await pool.query(
    `SELECT id, device_code AS "deviceCode", device_type AS "deviceType",
       vehicle_id AS "vehicleId", bin_id AS "binId", status, is_simulated AS "isSimulated"
     FROM resource_devices WHERE device_code = $1`,
    [deviceCode]
  );

  let deviceId;
  let credential = existingCredentials[deviceCode] || null;

  if (!existing.rows[0]) {
    const enrolled = await deviceService.registerDevice(adminUser, type, deviceCode, { isSimulated: true });
    deviceId = enrolled.id;
    credential = enrolled.credential;
  } else {
    const row = existing.rows[0];
    if (row.deviceType !== type || row.isSimulated !== true) {
      throw new Error(`Existing device ${deviceCode} is not a simulated ${type} device.`);
    }
    deviceId = row.id;
    if (row.status !== "ACTIVE") {
      await pool.query("UPDATE resource_devices SET status = 'ACTIVE' WHERE id = $1", [deviceId]);
      credential = null;
    }
    if (!credential) {
      const rotated = await deviceService.rotateCredential(adminUser, type, deviceId);
      credential = rotated.credential;
    }
  }

  await deviceService.associateDevice(adminUser, type, deviceId, resourceId);
  return {
    id: deviceId,
    deviceCode,
    deviceType: type,
    resourceId,
    isSimulated: true,
    credential,
  };
}

async function ensureSimulationEnvironment({ rotateCredentials = false } = {}) {
  assertDevelopmentRuntime("Simulation environment setup");
  assertLoopbackDatabase();

  const previousState = readStateFile();
  const previousCredentials = rotateCredentials
    ? {}
    : Object.fromEntries(
      [...(previousState?.gpsDevices || []), ...(previousState?.iotDevices || [])]
        .filter((item) => item?.deviceCode && item?.credential)
        .map((item) => [item.deviceCode, item.credential])
    );

  const testPassword = process.env.SIM_TEST_PASSWORD || `SimTest!${randomBytes(6).toString("hex")}`;
  const passwordHash = await bcrypt.hash(testPassword, 10);

  const client = await pool.connect();
  let adminUser;
  let companyId;
  let districtId;
  let representativeId;
  const collectorIds = new Map();
  const vehicleIds = new Map();
  const binIds = new Map();

  try {
    await client.query("BEGIN");

    const existingAdmin = await client.query(
      "SELECT id, full_name AS \"fullName\", email, role FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1"
    );
    adminUser = existingAdmin.rows[0] || await ensureUser(client, {
      fullName: "[SIM-TEST] Simulation Admin",
      email: "sim-admin@swms-test.local",
      role: "ADMIN",
      passwordHash,
    });

    const companyRes = await client.query(
      `INSERT INTO companies (name, district, sector, cell, village)
       VALUES ($1, $2, 'Nyarugenge', 'Biryogo', 'Sim-HQ')
       ON CONFLICT (name) DO UPDATE SET district = EXCLUDED.district
       RETURNING id`,
      [TEST_COMPANY_NAME, TEST_DISTRICT_NAME]
    );
    companyId = companyRes.rows[0].id;

    const districtExisting = await client.query(
      "SELECT id FROM districts WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1))",
      [TEST_DISTRICT_NAME]
    );
    if (districtExisting.rows[0]) {
      districtId = districtExisting.rows[0].id;
    } else {
      const createdDistrict = await client.query(
        "INSERT INTO districts (name) VALUES ($1) RETURNING id",
        [TEST_DISTRICT_NAME]
      );
      districtId = createdDistrict.rows[0].id;
    }

    const activeAgreement = await client.query(
      `SELECT id, company_id AS "companyId" FROM company_district_agreements
       WHERE district_id = $1 AND status = 'ACTIVE'`,
      [districtId]
    );
    if (activeAgreement.rows[0]) {
      if (activeAgreement.rows[0].companyId !== companyId) {
        throw new Error(`Simulation district "${TEST_DISTRICT_NAME}" is assigned to another company.`);
      }
    } else {
      const pending = await client.query(
        `SELECT id FROM company_district_agreements
         WHERE district_id = $1 AND company_id = $2 AND status = 'PENDING'
         ORDER BY id DESC LIMIT 1`,
        [districtId, companyId]
      );
      let agreementId = pending.rows[0]?.id;
      if (!agreementId) {
        const createdAgreement = await client.query(
          `INSERT INTO company_district_agreements (district_id, company_id, status, starts_on, created_by)
           VALUES ($1, $2, 'PENDING', CURRENT_DATE, $3) RETURNING id`,
          [districtId, companyId, adminUser.id]
        );
        agreementId = createdAgreement.rows[0].id;
      }
      await client.query(
        "UPDATE company_district_agreements SET status = 'ACTIVE' WHERE id = $1",
        [agreementId]
      );
    }

    const repUser = await ensureUser(client, {
      fullName: "[SIM-TEST] EcoTrack Representative",
      email: "sim-rep@swms-test.local",
      role: "COMPANY_REPRESENTATIVE",
      passwordHash,
    });
    const repExisting = await client.query(
      "SELECT id FROM representatives WHERE company_id = $1",
      [companyId]
    );
    if (repExisting.rows[0]) {
      representativeId = repExisting.rows[0].id;
      await client.query(
        "UPDATE representatives SET user_id = $1, district = $2, sector = 'Nyarugenge' WHERE id = $3",
        [repUser.id, TEST_DISTRICT_NAME, representativeId]
      );
    } else {
      const repRes = await client.query(
        `INSERT INTO representatives (user_id, company_id, district, sector)
         VALUES ($1, $2, $3, 'Nyarugenge')
         RETURNING id`,
        [repUser.id, companyId, TEST_DISTRICT_NAME]
      );
      representativeId = repRes.rows[0].id;
    }

    for (const [index, email] of [
      "sim-collector-1@swms-test.local",
      "sim-collector-2@swms-test.local",
    ].entries()) {
      const colUser = await ensureUser(client, {
        fullName: `[SIM-TEST] Collector ${index + 1}`,
        email,
        role: "COLLECTOR",
        passwordHash,
      });
      const existingCol = await client.query("SELECT id FROM collectors WHERE user_id = $1", [colUser.id]);
      if (existingCol.rows[0]) {
        await client.query(
          "UPDATE collectors SET representative_id = $1, district = $2 WHERE id = $3",
          [representativeId, TEST_DISTRICT_NAME, existingCol.rows[0].id]
        );
        collectorIds.set(email, existingCol.rows[0].id);
      } else {
        const createdCol = await client.query(
          `INSERT INTO collectors (user_id, representative_id, district, sector)
           VALUES ($1, $2, $3, 'Nyarugenge') RETURNING id`,
          [colUser.id, representativeId, TEST_DISTRICT_NAME]
        );
        collectorIds.set(email, createdCol.rows[0].id);
      }
    }

    for (const item of SIM_HOUSEHOLDS) {
      const collectorId = collectorIds.get(item.collectorEmail);
      const hhUser = await ensureUser(client, {
        fullName: item.fullName,
        email: item.email,
        role: "HOUSEHOLD",
        passwordHash,
      });
      const existingHh = await client.query("SELECT id FROM households WHERE user_id = $1", [hhUser.id]);
      let householdId;
      if (existingHh.rows[0]) {
        householdId = existingHh.rows[0].id;
        await client.query(
          `UPDATE households
           SET collector_id = $1, address = $2, district = $3, sector = $4, cell = $5, village = $6,
               latitude = $7, longitude = $8, location_accuracy = $9,
               location_captured_at = COALESCE(location_captured_at, CURRENT_TIMESTAMP)
           WHERE id = $10`,
          [
            collectorId, item.address, TEST_DISTRICT_NAME, item.sector, item.cell, item.village,
            item.latitude, item.longitude, item.locationAccuracy, householdId,
          ]
        );
      } else {
        const createdHh = await client.query(
          `INSERT INTO households
            (user_id, collector_id, address, district, sector, cell, village,
             latitude, longitude, location_accuracy, location_captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            hhUser.id, collectorId, item.address, TEST_DISTRICT_NAME,
            item.sector, item.cell, item.village, item.latitude, item.longitude, item.locationAccuracy,
          ]
        );
        householdId = createdHh.rows[0].id;
      }

      const existingBin = await client.query("SELECT id FROM waste_bins WHERE household_id = $1", [householdId]);
      let binId;
      if (existingBin.rows[0]) {
        binId = existingBin.rows[0].id;
        await client.query(
          `UPDATE waste_bins
           SET bin_code = $1, latitude = $2, longitude = $3, location_accuracy = $4,
               location_captured_at = COALESCE(location_captured_at, CURRENT_TIMESTAMP)
           WHERE id = $5`,
          [item.binCode, item.latitude, item.longitude, item.locationAccuracy, binId]
        );
      } else {
        const createdBin = await client.query(
          `INSERT INTO waste_bins
            (household_id, bin_code, capacity, latitude, longitude, location_accuracy, location_captured_at)
           VALUES ($1, $2, 240, $3, $4, $5, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            householdId,
            item.binCode,
            item.latitude,
            item.longitude,
            item.locationAccuracy,
          ]
        );
        binId = createdBin.rows[0].id;
      }
      binIds.set(item.binCode, { binId, householdId, ...item });

      const activeCollection = await client.query(
        `SELECT id FROM collections
         WHERE household_id = $1 AND status IN ('pending', 'scheduled', 'in_progress')
         LIMIT 1`,
        [householdId]
      );
      if (!activeCollection.rows[0]) {
        await client.query(
          `INSERT INTO collections (household_id, collector_id, scheduled_at, status, notes, created_by)
           VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '2 hours', 'scheduled', '[SIM-TEST] Scheduled simulated pickup', $3)`,
          [householdId, collectorId, adminUser.id]
        );
      }
    }

    for (const veh of SIM_VEHICLES) {
      const collectorId = collectorIds.get(veh.collectorEmail);
      const existingVeh = await client.query(
        `SELECT id, assigned_collector_id AS "assignedCollectorId"
         FROM fleet_vehicles
         WHERE company_id = $1 AND LOWER(BTRIM(registration_number)) = LOWER(BTRIM($2))`,
        [companyId, veh.registrationNumber]
      );
      let vehicleId;
      if (existingVeh.rows[0]) {
        vehicleId = existingVeh.rows[0].id;
        if (existingVeh.rows[0].assignedCollectorId !== collectorId) {
          await client.query(
            `UPDATE fleet_vehicles SET assigned_collector_id = $1, operational_status = 'IN_SERVICE' WHERE id = $2`,
            [collectorId, vehicleId]
          );
        }
      } else {
        const createdVeh = await client.query(
          `INSERT INTO fleet_vehicles
            (company_id, registration_number, vehicle_type, make, model, capacity, fuel_type,
             operational_status, assigned_collector_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'IN_SERVICE', $8, $9)
           RETURNING id`,
          [
            companyId, veh.registrationNumber, veh.vehicleType, veh.make, veh.model,
            veh.capacity, veh.fuelType, collectorId, adminUser.id,
          ]
        );
        vehicleId = createdVeh.rows[0].id;
        await client.query(
          `INSERT INTO vehicle_assignment_history (vehicle_id, collector_id, collector_name, assigned_by)
           VALUES ($1, $2, $3, $4)`,
          [vehicleId, collectorId, veh.collectorEmail, adminUser.id]
        );
      }
      vehicleIds.set(veh.registrationNumber, vehicleId);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const gpsDevices = [];
  for (const veh of SIM_VEHICLES) {
    const vehicleId = vehicleIds.get(veh.registrationNumber);
    const enrolled = await ensureDevice(adminUser, "GPS", veh.deviceCode, vehicleId, previousCredentials);
    gpsDevices.push({
      ...enrolled,
      vehicleId,
      registrationNumber: veh.registrationNumber,
      route: veh.route,
    });
  }

  const iotDevices = [];
  for (const item of SIM_HOUSEHOLDS) {
    if (!item.sensorDeviceCode) continue;
    const binRecord = binIds.get(item.binCode);
    const enrolled = await ensureDevice(adminUser, "BIN", item.sensorDeviceCode, binRecord.binId, previousCredentials);
    iotDevices.push({
      ...enrolled,
      binId: binRecord.binId,
      binCode: item.binCode,
      initialFillLevel: item.initialFillLevel,
    });
  }

  await auditModel.record({
    actorUserId: adminUser.id,
    action: "SIMULATION_ENVIRONMENT_INITIALIZED",
    resourceType: "SIMULATION",
    resourceId: String(companyId),
    metadata: {
      isSimulated: true,
      companyName: TEST_COMPANY_NAME,
      districtName: TEST_DISTRICT_NAME,
      gpsDeviceCodes: gpsDevices.map((d) => d.deviceCode),
      iotDeviceCodes: iotDevices.map((d) => d.deviceCode),
    },
  });

  const state = {
    initializedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    companyId,
    companyName: TEST_COMPANY_NAME,
    districtId,
    districtName: TEST_DISTRICT_NAME,
    representativeId,
    accounts: {
      adminEmail: adminUser.email,
      representativeEmail: "sim-rep@swms-test.local",
      collectorEmails: ["sim-collector-1@swms-test.local", "sim-collector-2@swms-test.local"],
      householdEmails: SIM_HOUSEHOLDS.map((h) => h.email),
    },
    gpsDevices,
    iotDevices,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  return state;
}

if (require.main === module) {
  const rotate = process.argv.includes("--rotate");
  ensureSimulationEnvironment({ rotateCredentials: rotate })
    .then((state) => {
      console.log("SWMS development simulation environment is ready.");
      console.log(`Company: ${state.companyName} (id=${state.companyId})`);
      console.log(`District: ${state.districtName} (id=${state.districtId})`);
      console.log("GPS devices:", state.gpsDevices.map((d) => `${d.deviceCode} -> ${d.registrationNumber}`).join(", "));
      console.log("IoT devices:", state.iotDevices.map((d) => `${d.deviceCode} -> ${d.binCode}`).join(", "));
      console.log(`Test credentials saved locally in ${STATE_FILE} (gitignored).`);
    })
    .catch((error) => {
      console.error("Simulation setup failed:", error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = {
  STATE_FILE,
  TEST_COMPANY_NAME,
  TEST_DISTRICT_NAME,
  readStateFile,
  ensureSimulationEnvironment,
};
