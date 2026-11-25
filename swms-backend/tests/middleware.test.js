const test = require("node:test");
const assert = require("node:assert/strict");
const { validateBody, validateId, validateIds, requireRoleFields } = require("../middleware/validate");
const {
  authorizeAdmin,
  authorizeCollectionManager,
  authorizeCollectionDeleter,
  authorizeHouseholdManager,
  authorizeHouseholdReader,
  authorizeBinReader,
  authorizeBinManager,
  authorizeHousehold,
  authorizeAdminOrRepresentative,
  authorizeExportReader,
  authorizeVehicleReader,
  authorizeVehicleManager,
} = require("../middleware/authorization");
const { notFound, errorHandler } = require("../middleware/errorMiddleware");
const schemas = require("../validation/schemas");

function run(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => (error ? reject(error) : resolve(req)));
  });
}

test("body validation rejects unknown fields and invalid emails", async () => {
  await assert.rejects(
    run(validateBody({ email: { type: "email", required: true } }), {
      body: { email: "not-an-email", isAdmin: true },
    }),
    (error) => error.statusCode === 400 && error.details.length === 2
  );
});

test("body validation normalizes ISO dates to a UTC timestamp", async () => {
  const req = { body: { scheduledAt: "2026-11-01T09:00:00Z" } };
  await run(validateBody({ scheduledAt: { type: "datetime", required: true } }), req);
  assert.equal(req.body.scheduledAt, "2026-11-01T09:00:00.000Z");
});

test("date-only validation rejects impossible dates and preserves valid calendar dates", async () => {
  const req = { body: { startsOn: "2026-02-28" } };
  await run(validateBody({ startsOn: { type: "date", required: true } }), req);
  assert.equal(req.body.startsOn, "2026-02-28");
  await assert.rejects(
    run(validateBody({ startsOn: { type: "date", required: true } }), {
      body: { startsOn: "2026-02-30" },
    }),
    (error) => error.statusCode === 400 && error.code === "VALIDATION_ERROR"
  );
});

test("body validation trims ordinary strings but preserves passwords", async () => {
  const req = { body: { name: "  Green City  ", password: "  secret  " } };
  await run(validateBody({
    name: { type: "string", required: true },
    password: { type: "password", required: true },
  }), req);
  assert.equal(req.body.name, "Green City");
  assert.equal(req.body.password, "  secret  ");
});

test("role-dependent validation rejects missing hierarchy assignments", async () => {
  await assert.rejects(
    run(requireRoleFields({ ADMIN: ["representativeId"] }), {
      user: { role: "ADMIN" },
      body: {},
    }),
    (error) => error.statusCode === 400 && error.details[0].includes("representativeId")
  );
});

test("path IDs must be positive integers", async () => {
  const req = { params: { id: "12" } };
  await run(validateId, req);
  assert.equal(req.params.id, 12);
  await assert.rejects(run(validateId, { params: { id: "1 OR 1=1" } }), (error) => error.statusCode === 400);
});

test("multiple path IDs and decimal fields are validated", async () => {
  const req = { params: { id: "3", maintenanceId: "7" } };
  await run(validateIds("id", "maintenanceId"), req);
  assert.deepEqual(req.params, { id: 3, maintenanceId: 7 });
  await assert.rejects(
    run(validateIds("id", "maintenanceId"), { params: { id: "3", maintenanceId: "0" } }),
    (error) => error.statusCode === 400
  );
  const decimalRequest = { body: { capacity: 8500.5 } };
  await run(validateBody({ capacity: { type: "decimal", required: true, min: 0.01 } }), decimalRequest);
  assert.equal(decimalRequest.body.capacity, 8500.5);
  await assert.rejects(
    run(validateBody({ capacity: { type: "decimal", required: true, min: 0.01 } }), {
      body: { capacity: "8500.5" },
    }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    run(validateBody({ capacity: { type: "decimal", required: true, min: 0.01, scale: 2 } }), {
      body: { capacity: 8500.555 },
    }),
    (error) => error.statusCode === 400
  );
});

test("role guards distinguish administrators from household accounts", async () => {
  await run(authorizeAdmin, { user: { role: "ADMIN" } });
  await assert.rejects(
    run(authorizeAdmin, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
  await run(authorizeHousehold, { user: { role: "HOUSEHOLD" } });
});

test("company representatives can use household and collection management routes", async () => {
  const req = { user: { role: "COMPANY_REPRESENTATIVE" } };
  await run(authorizeHouseholdManager, req);
  await run(authorizeCollectionManager, req);
  await run(authorizeCollectionDeleter, req);
  await assert.rejects(
    run(authorizeCollectionDeleter, { user: { role: "COLLECTOR" } }),
    (error) => error.statusCode === 403
  );
  await assert.rejects(
    run(authorizeCollectionManager, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
});

test("household readers include collectors but exclude household accounts", async () => {
  await run(authorizeHouseholdReader, { user: { role: "ADMIN" } });
  await run(authorizeHouseholdReader, { user: { role: "COMPANY_REPRESENTATIVE" } });
  await run(authorizeHouseholdReader, { user: { role: "COLLECTOR" } });
  await assert.rejects(
    run(authorizeHouseholdReader, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
});

test("bin role guards preserve collector, representative, admin, and household boundaries", async () => {
  await run(authorizeBinReader, { user: { role: "ADMIN" } });
  await run(authorizeBinReader, { user: { role: "COMPANY_REPRESENTATIVE" } });
  await run(authorizeBinReader, { user: { role: "COLLECTOR" } });
  await assert.rejects(
    run(authorizeBinReader, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
  await run(authorizeBinManager, { user: { role: "ADMIN" } });
  await run(authorizeBinManager, { user: { role: "COLLECTOR" } });
  await assert.rejects(
    run(authorizeBinManager, { user: { role: "COMPANY_REPRESENTATIVE" } }),
    (error) => error.statusCode === 403
  );
  await assert.rejects(
    run(authorizeBinManager, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
});

test("collector reports remain management-scoped while export access respects collector ownership", async () => {
  await run(authorizeAdminOrRepresentative, { user: { role: "ADMIN" } });
  await run(authorizeAdminOrRepresentative, { user: { role: "COMPANY_REPRESENTATIVE" } });
  await assert.rejects(
    run(authorizeAdminOrRepresentative, { user: { role: "COLLECTOR" } }),
    (error) => error.statusCode === 403
  );
  await run(authorizeExportReader, { user: { role: "COLLECTOR" } });
  await assert.rejects(
    run(authorizeExportReader, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
});

test("fleet reads and writes preserve company and collector role boundaries", async () => {
  await run(authorizeVehicleReader, { user: { role: "ADMIN" } });
  await run(authorizeVehicleReader, { user: { role: "COMPANY_REPRESENTATIVE" } });
  await run(authorizeVehicleReader, { user: { role: "COLLECTOR" } });
  await assert.rejects(
    run(authorizeVehicleReader, { user: { role: "HOUSEHOLD" } }),
    (error) => error.statusCode === 403
  );
  await run(authorizeVehicleManager, { user: { role: "ADMIN" } });
  await run(authorizeVehicleManager, { user: { role: "COMPANY_REPRESENTATIVE" } });
  await assert.rejects(
    run(authorizeVehicleManager, { user: { role: "COLLECTOR" } }),
    (error) => error.statusCode === 403
  );
});

test("bin fill-level validation accepts 0-100 and rejects out-of-range values", async () => {
  const req = { body: { fillLevel: 0 } };
  await run(validateBody(schemas.binProgress), req);
  assert.equal(req.body.fillLevel, 0);
  await assert.rejects(
    run(validateBody(schemas.binProgress), { body: { fillLevel: 101 } }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    run(validateBody(schemas.binProgress), { body: { fillLevel: -1 } }),
    (error) => error.statusCode === 400
  );
});

test("collection creation permits only pending or scheduled initial statuses", async () => {
  const validBase = {
    householdId: 1,
    collectorId: 1,
    scheduledAt: "2026-11-25T09:00:00Z",
  };
  for (const status of ["pending", "scheduled"]) {
    await run(validateBody(schemas.collectionCreate), { body: { ...validBase, status } });
  }
  for (const status of ["in_progress", "collected", "completed", "missed", "cancelled"]) {
    await assert.rejects(
      run(validateBody(schemas.collectionCreate), { body: { ...validBase, status } }),
      (error) => error.statusCode === 400 && error.code === "VALIDATION_ERROR"
    );
  }
});

test("missing routes return a structured 404 error", () => {
  let error;
  notFound({}, {}, (nextError) => { error = nextError; });
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
  errorHandler(error, {}, response, () => {});
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error.message, "The requested endpoint was not found.");
});
