require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const { createDistrictAgreementService } = require("../services/districtAgreementService");

test("district agreements require explicit activation and preserve unassigned history", async (t) => {
  if (!process.env.DB_NAME) {
    t.skip("DB_NAME is not configured");
    return;
  }

  const client = await pool.connect();
  await client.query("BEGIN");
  let savepoint = 0;
  const service = createDistrictAgreementService(async (callback) => {
    const name = `district_service_${++savepoint}`;
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
       VALUES ('District Test Admin', $1, 'not-a-real-password', 'ADMIN') RETURNING id`,
      [`district-admin-${suffix}@example.test`]
    );
    const company = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id",
      [`District Test Company ${suffix}`]
    );
    const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
    const district = await service.createDistrict(`Test District ${suffix}`, admin.rows[0].id);
    const initial = await service.createAgreement(
      district.id,
      { companyId: company.rows[0].id, startsOn: today },
      admin.rows[0].id
    );

    assert.equal(initial.status, "PENDING");
    assert.equal((await service.findAgreementById(initial.id, client)).status, "PENDING");
    const pendingAuthorization = await client.query(
      "SELECT company_has_active_district($1, $2) AS authorized",
      [company.rows[0].id, ` test district ${suffix} `]
    );
    assert.equal(pendingAuthorization.rows[0].authorized, false);
    assert.equal((await (await client.query(
      "SELECT assignment_status FROM districts WHERE id = $1", [district.id]
    )).rows[0]).assignment_status, "UNASSIGNED");
    await assert.rejects(
      service.createAgreement(
        district.id,
        { companyId: company.rows[0].id, startsOn: today },
        admin.rows[0].id
      ),
      (error) => error.statusCode === 409
    );

    const active = await service.transitionAgreement(initial.id, "ACTIVE", null, admin.rows[0].id);
    assert.equal(active.status, "ACTIVE");
    const activeAuthorization = await client.query(
      "SELECT company_has_active_district($1, $2) AS authorized",
      [company.rows[0].id, ` test district ${suffix} `]
    );
    assert.equal(activeAuthorization.rows[0].authorized, true);
    const otherCompany = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id",
      [`Other District Test Company ${suffix}`]
    );
    const otherDistrict = await service.createDistrict(`Other Test District ${suffix}`, admin.rows[0].id);
    const otherAgreement = await service.createAgreement(
      otherDistrict.id,
      { companyId: otherCompany.rows[0].id, startsOn: today },
      admin.rows[0].id
    );
    await service.transitionAgreement(otherAgreement.id, "ACTIVE", null, admin.rows[0].id);
    const crossCompanyAuthorization = await client.query(
      `SELECT company_has_active_district($1, $2) AS company_a_access,
        company_has_active_district($3, $2) AS company_b_access`,
      [company.rows[0].id, `Other Test District ${suffix}`, otherCompany.rows[0].id]
    );
    assert.equal(crossCompanyAuthorization.rows[0].company_a_access, false);
    assert.equal(crossCompanyAuthorization.rows[0].company_b_access, true);
    assert.equal((await client.query(
      "SELECT assignment_status FROM districts WHERE id = $1", [district.id]
    )).rows[0].assignment_status, "ASSIGNED");

    const suspended = await service.transitionAgreement(
      initial.id,
      "SUSPENDED",
      "Test suspension",
      admin.rows[0].id
    );
    assert.equal(suspended.status, "SUSPENDED");
    const suspendedAuthorization = await client.query(
      "SELECT company_has_active_district($1, $2) AS authorized",
      [company.rows[0].id, `Test District ${suffix}`]
    );
    assert.equal(suspendedAuthorization.rows[0].authorized, false);
    assert.equal((await client.query(
      "SELECT assignment_status FROM districts WHERE id = $1", [district.id]
    )).rows[0].assignment_status, "UNASSIGNED");

    const replacement = await service.createAgreement(
      district.id,
      { companyId: company.rows[0].id, startsOn: today },
      admin.rows[0].id
    );
    assert.equal(replacement.status, "PENDING");
    assert.equal((await client.query(
      "SELECT assignment_status FROM districts WHERE id = $1", [district.id]
    )).rows[0].assignment_status, "UNASSIGNED");
    await service.transitionAgreement(replacement.id, "ACTIVE", null, admin.rows[0].id);
    assert.equal((await client.query(
      "SELECT assignment_status FROM districts WHERE id = $1", [district.id]
    )).rows[0].assignment_status, "ASSIGNED");

    await assert.rejects(
      service.transitionAgreement(initial.id, "ACTIVE", null, admin.rows[0].id),
      (error) => error.statusCode === 409
    );
    const notifications = await client.query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE resource_id = $1 AND resource_type = 'district_agreement' AND user_id = $2`,
      [initial.id, admin.rows[0].id]
    );
    assert.equal(notifications.rows[0].count, 1);
    const history = await client.query(
      "SELECT status FROM company_district_agreements WHERE district_id = $1 ORDER BY id",
      [district.id]
    );
    assert.deepEqual(history.rows.map((row) => row.status), ["SUSPENDED", "ACTIVE"]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
