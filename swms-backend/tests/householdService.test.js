const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const householdModel = require("../models/householdModel");
const collectorModel = require("../models/collectorModel");
const householdService = require("../services/householdService");
const districtAuthorizationService = require("../services/districtAuthorizationService");

test("collector household listing is scoped to the collector profile", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  const list = t.mock.method(householdModel, "list", async () => []);

  await householdService.list({ id: 8, role: "COLLECTOR" });

  assert.deepEqual(list.mock.calls[0].arguments, [14]);
});

test("collector cannot view or mutate a household assigned to another collector", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(householdModel, "findById", async () => ({
    id: 22,
    collectorId: 15,
  }));
  const update = t.mock.method(householdModel, "update", async () => null);
  const remove = t.mock.method(householdModel, "remove", async () => true);
  const collector = { id: 8, role: "COLLECTOR" };

  await assert.rejects(
    householdService.get(collector, 22),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    householdService.update(collector, 22, {}),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    householdService.remove(collector, 22),
    (error) => error.statusCode === 404
  );
  assert.equal(update.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

test("collector can update and delete their own household", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(householdModel, "findById", async () => ({
    id: 22,
    collectorId: 14,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(collectorModel, "findById", async () => ({
    id: 14,
    companyId: 5,
    district: "Kayonza",
  }));
  t.mock.method(districtAuthorizationService, "companyCanOperateInDistrict", async () => true);
  const update = t.mock.method(householdModel, "update", async () => ({ id: 22 }));
  const remove = t.mock.method(householdModel, "remove", async () => true);
  const collector = { id: 8, role: "COLLECTOR" };

  assert.deepEqual(await householdService.update(collector, 22, {}), { id: 22 });
  assert.equal(await householdService.remove(collector, 22), true);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 1);
});
