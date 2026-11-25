const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const vehicleModel = require("../models/vehicleModel");
const collectorModel = require("../models/collectorModel");
const districtAuthorizationService = require("../services/districtAuthorizationService");
const auditModel = require("../models/auditModel");
const vehicleService = require("../services/vehicleService");

function transactionClient() {
  return {
    async query() {
      return { rows: [] };
    },
    release() {},
  };
}

test("company representatives cannot view vehicles owned by another company", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ company_id: 9 }] }));
  t.mock.method(vehicleModel, "findById", async () => ({
    id: 2,
    companyId: 5,
    assignedCollectorId: null,
  }));

  await assert.rejects(
    vehicleService.get({ id: 8, role: "COMPANY_REPRESENTATIVE" }, 2),
    (error) => error.statusCode === 404
  );
});

test("collector vehicle lists are limited to that collector's authorized assignment", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  const list = t.mock.method(vehicleModel, "list", async () => []);

  await vehicleService.list({ id: 8, role: "COLLECTOR" }, { limit: 20, offset: 0 });

  assert.deepEqual(list.mock.calls[0].arguments, [
    { collectorId: 14 },
    { limit: 20, offset: 0 },
  ]);
});

test("vehicle assignment checks company ownership and active district authorization", async (t) => {
  const client = transactionClient();
  t.mock.method(pool, "connect", async () => client);
  t.mock.method(pool, "query", async () => ({ rows: [{ company_id: 5 }] }));
  const vehicle = {
    id: 2,
    companyId: 5,
    status: "AVAILABLE",
    assignedCollectorId: null,
  };
  t.mock.method(vehicleModel, "findById", async () => vehicle);
  t.mock.method(collectorModel, "findById", async () => ({
    id: 14,
    companyId: 5,
    fullName: "Jordan Collector",
    district: "Kayonza",
  }));
  t.mock.method(districtAuthorizationService, "companyCanOperateInDistrict", async () => true);
  const assign = t.mock.method(vehicleModel, "assign", async () => ({
    ...vehicle,
    status: "IN_SERVICE",
    assignedCollectorId: 14,
  }));
  const recordAssignment = t.mock.method(vehicleModel, "recordAssignment", async () => {});
  t.mock.method(auditModel, "record", async () => {});

  const result = await vehicleService.assign(
    { id: 8, role: "COMPANY_REPRESENTATIVE" },
    2,
    14
  );
  assert.equal(result.assignedCollectorId, 14);
  assert.deepEqual(assign.mock.calls[0].arguments, [client, 2, 14]);
  assert.deepEqual(recordAssignment.mock.calls[0].arguments, [
    client,
    2,
    14,
    "Jordan Collector",
    8,
  ]);
  assert.equal(districtAuthorizationService.companyCanOperateInDistrict.mock.calls[0].arguments[1], "Kayonza");
});

test("an assigned vehicle cannot be changed to maintenance without unassigning", async (t) => {
  const client = transactionClient();
  t.mock.method(pool, "connect", async () => client);
  t.mock.method(pool, "query", async () => ({ rows: [{ company_id: 5 }] }));
  t.mock.method(vehicleModel, "findById", async () => ({
    id: 2,
    companyId: 5,
    status: "IN_SERVICE",
    assignedCollectorId: 14,
  }));
  const setStatus = t.mock.method(vehicleModel, "setStatus", async () => {});

  await assert.rejects(
    vehicleService.setStatus(
      { id: 8, role: "COMPANY_REPRESENTATIVE" },
      2,
      "MAINTENANCE"
    ),
    (error) => error.statusCode === 409
  );
  assert.equal(setStatus.mock.callCount(), 0);
});
