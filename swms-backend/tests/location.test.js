const test = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const schemas = require("../validation/schemas");
const { validateBody } = require("../middleware/validate");
const accountService = require("../services/accountService");
const companyModel = require("../models/companyModel");
const representativeModel = require("../models/representativeModel");
const collectorModel = require("../models/collectorModel");
const householdModel = require("../models/householdModel");
const userModel = require("../models/userModel");
const binModel = require("../models/binModel");

const location = {
  district: "Kayonza",
  sector: "Gahini",
  cell: "Kiyenzi",
  village: "Rugarama",
};

function runValidation(schema, body) {
  return new Promise((resolve, reject) => {
    validateBody(schema)({ body }, {}, (error) => (error ? reject(error) : resolve(body)));
  });
}

test("location fields are accepted on create and update schemas", async () => {
  await runValidation(schemas.company, { name: "Company", ...location });
  await runValidation(schemas.representativeCreate, {
    fullName: "Representative",
    email: "rep@example.com",
    password: "StrongPass123!",
    companyId: 1,
    ...location,
  });
  await runValidation(schemas.representativeUpdate, location);
  await runValidation(schemas.collectorCreate, {
    fullName: "Collector",
    email: "collector@example.com",
    password: "StrongPass123!",
    ...location,
  });
  await runValidation(schemas.collectorUpdate, location);
  await runValidation(schemas.householdCreate, {
    fullName: "Household",
    email: "household@example.com",
    password: "StrongPass123!",
    address: "10 Main St",
    ...location,
  });
  await runValidation(schemas.householdUpdate, location);
  await runValidation(schemas.householdSelf, location);
});

test("account creation forwards location values to each profile model", async (t) => {
  const client = {
    query: async () => ({ rows: [] }),
    release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  t.mock.method(userModel, "create", async () => 10);
  t.mock.method(companyModel, "findById", async () => ({ id: 1 }));
  t.mock.method(representativeModel, "findById", async () => ({ id: 2 }));
  t.mock.method(collectorModel, "findById", async () => ({ id: 3 }));
  const createRepresentative = t.mock.method(representativeModel, "create", async () => 20);
  const createCollector = t.mock.method(collectorModel, "create", async () => 30);
  const createHousehold = t.mock.method(householdModel, "create", async () => 40);
  t.mock.method(binModel, "createForHousehold", async () => 50);

  const base = { fullName: "Person", email: "person@example.com", passwordHash: "hash", ...location };
  await accountService.createAccount({ ...base, role: "COMPANY_REPRESENTATIVE", companyId: 1 });
  await accountService.createAccount({ ...base, role: "COLLECTOR", representativeId: 2 });
  await accountService.createAccount({
    ...base,
    role: "HOUSEHOLD",
    collectorId: 3,
    address: "10 Main St",
  });

  assert.deepEqual(createRepresentative.mock.calls[0].arguments[3], location);
  assert.deepEqual(createCollector.mock.calls[0].arguments[3], location);
  assert.deepEqual(createHousehold.mock.calls[0].arguments[5], location);
});

test("company location values are persisted and included in returned records", async (t) => {
  const calls = [];
  const company = { id: 1, name: "Company", ...location };
  t.mock.method(pool, "query", async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("INSERT INTO companies")) return { rows: [{ id: 1 }] };
    return { rows: [company] };
  });

  assert.deepEqual(await companyModel.create("Company", location), company);
  assert.deepEqual(calls[0].params, ["Company", ...Object.values(location)]);

  assert.deepEqual(await companyModel.update(1, "Updated Company", location), company);
  const update = calls.find(({ sql }) => sql.includes("UPDATE companies"));
  assert.deepEqual(update.params, ["Updated Company", ...Object.values(location), 1]);
  assert.match(calls.find(({ sql }) => sql.includes("SELECT")).sql, /district, sector, cell, village/);
});

test("representative, collector, and household models persist and select location fields", async (t) => {
  const profiles = [
    {
      name: "representative",
      model: representativeModel,
      create: (model, executor) => model.create(executor, 1, 2, location),
    },
    {
      name: "collector",
      model: collectorModel,
      create: (model, executor) => model.create(executor, 1, 2, location),
    },
    {
      name: "household",
      model: householdModel,
      create: (model, executor) => model.create(executor, 1, 2, "10 Main St", null, location),
    },
  ];

  for (const { name, model, create } of profiles) {
    await t.test(name, async () => {
      const calls = [];
      const executor = {
        async query(sql, params) {
          calls.push({ sql, params });
          return sql.includes("INSERT INTO")
            ? { rows: [{ id: 7 }] }
            : { rows: [{ id: 7, ...location }] };
        },
      };

      assert.equal(await create(model, executor), 7);
      assert.deepEqual(calls[0].params.slice(-4), Object.values(location));
      const returned = await model.findById(7, executor);
      assert.deepEqual(returned, { id: 7, ...location });
      assert.match(calls[1].sql, /district, \w+\.sector, \w+\.cell, \w+\.village/);
    });
  }
});

test("representative, collector, and household updates persist location fields", async (t) => {
  const profiles = [
    {
      name: "representative",
      model: representativeModel,
      updatedTable: "representatives",
      updateParams: [null, ...Object.values(location), 7],
    },
    {
      name: "collector",
      model: collectorModel,
      updatedTable: "collectors",
      updateParams: [null, ...Object.values(location), 7],
    },
    {
      name: "household",
      model: householdModel,
      updatedTable: "households",
      updateParams: [null, null, ...Object.values(location), 7],
    },
  ];

  for (const { name, model, updatedTable, updateParams } of profiles) {
    await t.test(name, async (t) => {
      const poolCalls = [];
      const transactionCalls = [];
      t.mock.method(pool, "query", async (sql) => {
        poolCalls.push(sql);
        return poolCalls.length === 1
          ? { rows: [{ user_id: 1 }] }
          : { rows: [{ id: 7, ...location }] };
      });
      t.mock.method(pool, "connect", async () => ({
        async query(sql, params) {
          transactionCalls.push({ sql, params });
          return { rows: [] };
        },
        release() {},
      }));

      await model.update(7, location);

      const profileUpdate = transactionCalls.find(({ sql }) => sql.includes(`UPDATE ${updatedTable}`));
      assert.deepEqual(profileUpdate.params, updateParams);
      assert.match(profileUpdate.sql, /district = COALESCE/);
      assert.match(poolCalls[1], /district, \w+\.sector, \w+\.cell, \w+\.village/);
    });
  }
});
