require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const { createDistrictAgreementService } = require("../services/districtAgreementService");
const vehicleModel = require("../models/vehicleModel");

test("fleet constraints enforce company ownership, active districts, unique assignment, and history", async (t) => {
  if (!process.env.DB_NAME) {
    t.skip("DB_NAME is not configured");
    return;
  }

  const client = await pool.connect();
  await client.query("BEGIN");
  let savepoint = 0;
  async function expectConstraint(query, values, code) {
    const name = `vehicle_constraint_${++savepoint}`;
    await client.query(`SAVEPOINT ${name}`);
    await assert.rejects(client.query(query, values), (error) => error.code === code);
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
  }
  const agreements = createDistrictAgreementService(async (callback) => {
    const name = `fleet_test_${++savepoint}`;
    await client.query(`SAVEPOINT ${name}`);
    try {
      const result = await callback(client);
      await client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await client.query(`RELEASE SAVEPOINT ${name}`);
      throw error;
    }
  });

  try {
    const suffix = `${process.pid}_${Date.now()}`;
    const admin = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Fleet Test Admin', $1, 'not-a-real-password', 'ADMIN') RETURNING id`,
      [`fleet-admin-${suffix}@example.test`]
    );
    const company = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id",
      [`Fleet Test Company ${suffix}`]
    );
    const representativeUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Fleet Test Representative', $1, 'not-a-real-password', 'COMPANY_REPRESENTATIVE')
       RETURNING id`,
      [`fleet-rep-${suffix}@example.test`]
    );
    const representative = await client.query(
      "INSERT INTO representatives (user_id, company_id) VALUES ($1, $2) RETURNING id",
      [representativeUser.rows[0].id, company.rows[0].id]
    );
    const collectorUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Fleet Test Collector', $1, 'not-a-real-password', 'COLLECTOR') RETURNING id`,
      [`fleet-collector-${suffix}@example.test`]
    );
    const districtName = `Fleet District ${suffix}`;
    const collector = await client.query(
      `INSERT INTO collectors (user_id, representative_id, district)
       VALUES ($1, $2, $3) RETURNING id`,
      [collectorUser.rows[0].id, representative.rows[0].id, districtName]
    );
    const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
    const district = await agreements.createDistrict(districtName, admin.rows[0].id);
    const agreement = await agreements.createAgreement(
      district.id,
      { companyId: company.rows[0].id, startsOn: today },
      admin.rows[0].id
    );
    await agreements.transitionAgreement(agreement.id, "ACTIVE", null, admin.rows[0].id);
    const otherCompany = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id",
      [`Other Fleet Test Company ${suffix}`]
    );
    const otherRepresentativeUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Other Fleet Representative', $1, 'not-a-real-password', 'COMPANY_REPRESENTATIVE')
       RETURNING id`,
      [`other-fleet-rep-${suffix}@example.test`]
    );
    const otherRepresentative = await client.query(
      "INSERT INTO representatives (user_id, company_id) VALUES ($1, $2) RETURNING id",
      [otherRepresentativeUser.rows[0].id, otherCompany.rows[0].id]
    );
    const otherDistrictName = `Other Fleet District ${suffix}`;
    const otherCollectorUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Other Fleet Collector', $1, 'not-a-real-password', 'COLLECTOR') RETURNING id`,
      [`other-fleet-collector-${suffix}@example.test`]
    );
    const otherCollector = await client.query(
      `INSERT INTO collectors (user_id, representative_id, district)
       VALUES ($1, $2, $3) RETURNING id`,
      [otherCollectorUser.rows[0].id, otherRepresentative.rows[0].id, otherDistrictName]
    );
    const otherDistrict = await agreements.createDistrict(otherDistrictName, admin.rows[0].id);
    const otherAgreement = await agreements.createAgreement(
      otherDistrict.id,
      { companyId: otherCompany.rows[0].id, startsOn: today },
      admin.rows[0].id
    );
    await agreements.transitionAgreement(otherAgreement.id, "ACTIVE", null, admin.rows[0].id);
    const legacyCollectorUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Legacy Fleet Collector', $1, 'not-a-real-password', 'COLLECTOR') RETURNING id`,
      [`legacy-fleet-collector-${suffix}@example.test`]
    );
    const legacyCollector = await client.query(
      `INSERT INTO collectors (user_id, representative_id, district)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        legacyCollectorUser.rows[0].id,
        representative.rows[0].id,
        `Legacy Fleet District ${suffix}`,
      ]
    );

    const vehicle = await client.query(
      `INSERT INTO fleet_vehicles
        (company_id, registration_number, vehicle_type, capacity, fuel_type, created_by)
       VALUES ($1, $2, 'COMPACTOR', 8500.5, 'DIESEL', $3) RETURNING id`,
      [company.rows[0].id, `RAB-${suffix}`, admin.rows[0].id]
    );
    const vehicleRecord = await vehicleModel.findById(vehicle.rows[0].id, client, true);
    assert.equal(vehicleRecord.companyId, company.rows[0].id);
    assert.equal(vehicleRecord.registrationNumber, `RAB-${suffix}`);
    const secondVehicle = await client.query(
      `INSERT INTO fleet_vehicles
        (company_id, registration_number, vehicle_type, capacity, fuel_type, created_by)
       VALUES ($1, $2, 'TRUCK', 9000, 'DIESEL', $3) RETURNING id`,
      [company.rows[0].id, `RAC-${suffix}`, admin.rows[0].id]
    );
    await client.query(
      `UPDATE fleet_vehicles SET assigned_collector_id = $1, operational_status = 'IN_SERVICE'
       WHERE id = $2`,
      [collector.rows[0].id, vehicle.rows[0].id]
    );
    await client.query(
      `INSERT INTO vehicle_assignment_history (vehicle_id, collector_id, collector_name, assigned_by)
       VALUES ($1, $2, 'Fleet Test Collector', $3)`,
      [vehicle.rows[0].id, collector.rows[0].id, admin.rows[0].id]
    );
    await expectConstraint(
      `UPDATE fleet_vehicles SET assigned_collector_id = $1, operational_status = 'IN_SERVICE'
       WHERE id = $2`,
      [collector.rows[0].id, secondVehicle.rows[0].id],
      "23505"
    );
    await expectConstraint(
      `UPDATE fleet_vehicles SET assigned_collector_id = $1, operational_status = 'IN_SERVICE'
       WHERE id = $2`,
      [otherCollector.rows[0].id, secondVehicle.rows[0].id],
      "23514"
    );
    await expectConstraint(
      `UPDATE fleet_vehicles SET assigned_collector_id = $1, operational_status = 'IN_SERVICE'
       WHERE id = $2`,
      [legacyCollector.rows[0].id, secondVehicle.rows[0].id],
      "23514"
    );
    await expectConstraint(
      `INSERT INTO fleet_vehicles
        (company_id, registration_number, vehicle_type, capacity, fuel_type)
       VALUES ($1, $2, 'TRUCK', 1000, 'DIESEL')`,
      [company.rows[0].id, ` rab-${suffix} `],
      "23505"
    );

    await client.query(
      `INSERT INTO vehicle_maintenance
        (vehicle_id, description, scheduled_for, status, completed_at, created_by)
       VALUES ($1, 'Fleet inspection', $2, 'COMPLETED', CURRENT_TIMESTAMP, $3)`,
      [vehicle.rows[0].id, today, admin.rows[0].id]
    );
    const maintenance = await client.query(
      "SELECT status, completed_at FROM vehicle_maintenance WHERE vehicle_id = $1",
      [vehicle.rows[0].id]
    );
    assert.equal(maintenance.rows[0].status, "COMPLETED");
    assert.ok(maintenance.rows[0].completed_at);

    await agreements.transitionAgreement(agreement.id, "SUSPENDED", "Fleet access test", admin.rows[0].id);
    const released = await client.query(
      `SELECT assigned_collector_id, operational_status FROM fleet_vehicles WHERE id = $1`,
      [vehicle.rows[0].id]
    );
    assert.equal(released.rows[0].assigned_collector_id, null);
    assert.equal(released.rows[0].operational_status, "AVAILABLE");
    const history = await client.query(
      `SELECT assigned_at, unassigned_at FROM vehicle_assignment_history WHERE vehicle_id = $1`,
      [vehicle.rows[0].id]
    );
    assert.ok(history.rows[0].assigned_at);
    assert.ok(history.rows[0].unassigned_at);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
