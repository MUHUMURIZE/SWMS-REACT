const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const householdModel = require("../models/householdModel");
const binModel = require("../models/binModel");
const binService = require("../services/binService");
const accountService = require("../services/accountService");
const collectorModel = require("../models/collectorModel");
const userModel = require("../models/userModel");

test("fill levels map to the required bin statuses", () => {
  const cases = [
    [0, "EMPTY"],
    [1, "LOW"],
    [49, "LOW"],
    [50, "MEDIUM"],
    [79, "MEDIUM"],
    [80, "HIGH"],
    [99, "HIGH"],
    [100, "FULL"],
  ];
  for (const [fillLevel, expected] of cases) {
    assert.equal(binService.statusFor(fillLevel), expected);
  }
});

test("collector bin lists are scoped to their assigned households", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  const list = t.mock.method(binModel, "list", async () => []);

  await binService.list({ id: 8, role: "COLLECTOR" });

  assert.deepEqual(list.mock.calls[0].arguments, [{ collectorId: 14 }]);
});

test("representative bin lists are scoped to their company", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ company_id: 5 }] }));
  const list = t.mock.method(binModel, "list", async () => []);

  await binService.list({ id: 9, role: "COMPANY_REPRESENTATIVE" });

  assert.deepEqual(list.mock.calls[0].arguments, [{ companyId: 5 }]);
});

test("collector cannot access or mutate a bin assigned to another collector", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(binModel, "findById", async () => ({
    id: 22,
    collectorId: 15,
    companyId: 2,
  }));
  const update = t.mock.method(binModel, "update", async () => null);
  const updateProgress = t.mock.method(binModel, "updateProgress", async () => null);
  const remove = t.mock.method(binModel, "remove", async () => true);
  const collector = { id: 8, role: "COLLECTOR" };

  await assert.rejects(binService.get(collector, 22), (error) => error.statusCode === 404);
  await assert.rejects(binService.update(collector, 22, {}), (error) => error.statusCode === 404);
  await assert.rejects(binService.updateProgress(collector, 22, 85), (error) => error.statusCode === 404);
  await assert.rejects(binService.remove(collector, 22), (error) => error.statusCode === 404);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(updateProgress.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

test("collector can create a bin only for a household assigned to them", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(householdModel, "findById", async () => ({
    id: 7,
    collectorId: 15,
  }));
  const create = t.mock.method(binModel, "create", async () => ({ id: 22 }));

  await assert.rejects(
    binService.create({ id: 8, role: "COLLECTOR" }, {
      householdId: 7,
      binCode: "BIN-7",
      capacity: 120,
    }),
    (error) => error.statusCode === 404
  );
  assert.equal(create.mock.callCount(), 0);
});

test("a household cannot receive a second bin", async (t) => {
  t.mock.method(householdModel, "findById", async () => ({
    id: 7,
    collectorId: 14,
  }));
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  t.mock.method(binModel, "create", async () => {
    const error = new Error("unique constraint");
    error.code = "23505";
    throw error;
  });

  test("creating a household account creates its bin in the same transaction", async (t) => {
    const client = {
      query: async () => ({ rows: [] }),
      release() {},
    };
    t.mock.method(pool, "connect", async () => client);
    t.mock.method(collectorModel, "findById", async () => ({ id: 14 }));
    t.mock.method(userModel, "create", async () => 80);
    t.mock.method(householdModel, "create", async () => 7);
    const createBin = t.mock.method(binModel, "createForHousehold", async () => 25);

    await accountService.createAccount({
      fullName: "Household User",
      email: "household@example.com",
      passwordHash: "hash",
      role: "HOUSEHOLD",
      collectorId: 14,
      address: "7 Main Street",
    });

    assert.deepEqual(createBin.mock.calls[0].arguments, [client, 7]);
  });

  await assert.rejects(
    binService.create({ id: 8, role: "COLLECTOR" }, {
      householdId: 7,
      binCode: "BIN-7",
      capacity: 120,
    }),
    (error) => error.statusCode === 409 && error.code === "CONFLICT"
  );
});

test("progress updates calculate status and emptying resets progress", async (t) => {
  t.mock.method(binModel, "findById", async () => ({ id: 22, collectorId: 14 }));
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  const updateProgress = t.mock.method(binModel, "updateProgress", async (_id, fillLevel, status) => ({
    id: 22,
    fillLevel,
    status,
  }));
  const empty = t.mock.method(binModel, "empty", async () => ({
    id: 22,
    fillLevel: 0,
    status: "EMPTY",
  }));
  const collector = { id: 8, role: "COLLECTOR" };

  assert.deepEqual(await binService.updateProgress(collector, 22, 85), {
    id: 22,
    fillLevel: 85,
    status: "HIGH",
  });
  assert.deepEqual(updateProgress.mock.calls[0].arguments, [22, 85, "HIGH"]);
  assert.deepEqual(await binService.empty(collector, 22), {
    id: 22,
    fillLevel: 0,
    status: "EMPTY",
  });
  assert.equal(empty.mock.callCount(), 1);
});

test("bin deletion is rejected while its household exists", async (t) => {
  t.mock.method(binModel, "findById", async () => ({
    id: 22,
    householdId: 7,
    collectorId: 14,
  }));
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 14 }] }));
  const remove = t.mock.method(binModel, "remove", async () => true);

  await assert.rejects(
    binService.remove({ id: 8, role: "COLLECTOR" }, 22),
    (error) => error.statusCode === 409 && error.code === "CONFLICT"
  );
  assert.equal(remove.mock.callCount(), 0);
});

test("households receive only the bin linked to their own profile", async (t) => {
  t.mock.method(householdModel, "findByUserId", async () => ({ id: 7 }));
  const findByHouseholdId = t.mock.method(binModel, "findByHouseholdId", async (id) => ({
    id: 22,
    householdId: id,
    binCode: "BIN-7",
    capacity: 120,
    fillLevel: 50,
    status: "MEDIUM",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
  }));

  assert.deepEqual(await binService.myBin(8), {
    id: 22,
    householdId: 7,
    binCode: "BIN-7",
    capacity: 120,
    fillLevel: 50,
    status: "MEDIUM",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
  });
  assert.deepEqual(findByHouseholdId.mock.calls[0].arguments, [7]);
});
