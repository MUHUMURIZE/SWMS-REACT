const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { pool } = require("../config/db");
const { authenticateDevice } = require("../middleware/deviceAuthentication");

function run(req) {
  return new Promise((resolve, reject) => {
    authenticateDevice(req, {}, (error) => (error ? reject(error) : resolve(req)));
  });
}

test("valid device credentials are hashed before database lookup", async (t) => {
  const credential = "a".repeat(64);
  const query = t.mock.method(pool, "query", async (_sql, values) => ({
    rows: [{ id: 8, deviceType: "GPS" }],
    values,
  }));
  const req = { get: (name) => name === "x-device-credential" ? credential : undefined };
  await run(req);
  assert.deepEqual(req.device, { id: 8, deviceType: "GPS" });
  assert.equal(query.mock.calls[0].arguments[1][0],
    createHash("sha256").update(credential).digest("hex"));
  assert.notEqual(query.mock.calls[0].arguments[1][0], credential);
});

test("missing, malformed, and unrecognized hardware credentials are rejected", async (t) => {
  const query = t.mock.method(pool, "query", async () => ({ rows: [] }));
  await assert.rejects(run({ get: () => undefined }), (error) => error.statusCode === 401);
  await assert.rejects(run({ get: () => "not-a-device-secret" }), (error) => error.statusCode === 401);
  await assert.rejects(run({ get: () => "b".repeat(64) }), (error) => error.statusCode === 401);
  assert.equal(query.mock.callCount(), 1);
});
