const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const binService = require("../services/binService");
const binModel = require("../models/binModel");
const notificationService = require("../services/notificationService");
const reportModel = require("../models/reportModel");
const collectionModel = require("../models/collectionModel");
const { toCsv } = require("../utils/exportRows");
const reportController = require("../controllers/reportController");
const collectorModel = require("../models/collectorModel");
const districtAuthorizationService = require("../services/districtAuthorizationService");
const householdModel = require("../models/householdModel");
const collectionController = require("../controllers/collectionController");

test("bin threshold notifications fire only across 80, 90 and 100 boundaries", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(binModel, "findById", async () => ({
    id: 22,
    binCode: "BIN-22",
    householdId: 7,
    collectorId: 14,
    companyId: 5,
    district: "Kayonza",
    fillLevel: 79,
  }));
  t.mock.method(binModel, "updateProgress", async () => ({
    id: 22,
    binCode: "BIN-22",
    fillLevel: 80,
    status: "HIGH",
  }));
  t.mock.method(collectorModel, "findById", async () => ({
    id: 14,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(districtAuthorizationService, "companyCanOperateInDistrict", async () => true);
  let notificationLevel = null;
  t.mock.method(notificationService, "notifyBinFillLevel", async (_bin, level) => {
    notificationLevel = level;
  });

  await binService.updateProgress({ id: 8, role: "COLLECTOR" }, 22, 80);
  assert.equal(notificationLevel, 80);
});

test("collectors cannot schedule collections without an active district agreement", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(householdModel, "findById", async () => ({
    id: 7,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(householdModel, "findCollectorId", async () => 14);
  t.mock.method(collectorModel, "findById", async () => ({
    id: 14,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(districtAuthorizationService, "companyCanOperateInDistrict", async () => false);
  const create = t.mock.method(collectionModel, "create", async () => ({ id: 3 }));

  await assert.rejects(
    collectionController.create({
      body: { householdId: 7, collectorId: 14, scheduledAt: "2026-11-25T10:00:00Z" },
      user: { id: 8, role: "COLLECTOR" },
    }, { status() { return this; }, json() {} }),
    (error) => error.statusCode === 403
  );
  assert.equal(create.mock.callCount(), 0);
});

test("collectors cannot read collections after their district agreement ends", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(collectionModel, "findById", async () => ({
    id: 3,
    collectorId: 14,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(collectorModel, "findById", async () => ({
    id: 14,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(districtAuthorizationService, "companyCanOperateInDistrict", async () => false);

  await assert.rejects(
    collectionController.get({
      params: { id: 3 },
      user: { id: 8, role: "COLLECTOR" },
    }, { json() {} }),
    (error) => error.statusCode === 404
  );
});

test("CSV exports safely quote commas and quotes", () => {
  const csv = toCsv(
    [{ key: "name", label: "Name" }],
    [{ name: "Green, \"Smart\" City" }]
  );
  assert.equal(csv, 'Name\r\n"Green, ""Smart"" City"');
  assert.equal(
    toCsv([{ key: "value", label: "Value" }], [{ value: "=1+1" }]),
    "Value\r\n'=1+1"
  );
});

test("district report accepts an optional district filter", async (t) => {
  const query = t.mock.method(pool, "query", async (text, values) => {
    assert.match(text, /totalHouseholds/);
    assert.match(text, /collectionsInProgress/);
    assert.deepEqual(values, ["Kayonza"]);
    return { rows: [{ totalHouseholds: 12 }] };
  });
  const report = await reportModel.district("Kayonza");
  assert.equal(report.totalHouseholds, 12);
  assert.equal(query.mock.callCount(), 1);
});

test("report query identifiers reject malformed values before database access", async (t) => {
  const query = t.mock.method(pool, "query", async () => {
    throw new Error("database should not be queried");
  });
  await assert.rejects(
    reportController.collector({
      query: { collectorId: "2 OR 1=1" },
      user: { role: "ADMIN" },
    }, { json() {} }),
    (error) => error.statusCode === 400 && error.code === "VALIDATION_ERROR"
  );
  assert.equal(query.mock.callCount(), 0);
});

test("company representatives cannot use a report query to select another company", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ company_id: 7 }] }));
  const companyReport = t.mock.method(reportModel, "company", async (companyId) => ({ companyId }));
  const response = { json(body) { this.body = body; } };
  await reportController.company({
    query: { companyId: "99" },
    user: { id: 8, role: "COMPANY_REPRESENTATIVE" },
  }, response);
  assert.deepEqual(response.body, { data: { companyId: 7 } });
  assert.deepEqual(companyReport.mock.calls[0].arguments, [7]);
});

test("scheduling queries distinguish all supported modes", async (t) => {
  const query = t.mock.method(pool, "query", async (text) => {
    assert.match(text, /FROM collections cl/);
    return { rows: [] };
  });
  for (const mode of ["upcoming", "missed", "overdue", "rescheduled"]) {
    await collectionModel.listScheduling({
      role: "ADMIN",
      userId: 1,
      pagination: { limit: 50, offset: 0 },
    }, mode);
  }
  assert.equal(query.mock.callCount(), 4);
});
