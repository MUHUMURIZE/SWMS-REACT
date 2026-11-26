const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createRateLimiter } = require("../middleware/loginRateLimiter");

test("rate limits return 429 and isolate authenticated device quotas", async (t) => {
  const app = express();
  app.use((req, _res, next) => {
    req.device = { id: req.get("x-device-id") };
    next();
  });
  app.use(createRateLimiter({
    name: `test-device-${process.pid}`,
    windowMs: 60_000,
    limit: 2,
    keyGenerator: (req) => `device:${req.device.id}`,
    useMemoryStore: true,
  }));
  app.get("/", (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  const request = (deviceId) => fetch(url, { headers: { "x-device-id": deviceId } });

  assert.equal((await request("gps-1")).status, 200);
  assert.equal((await request("gps-1")).status, 200);
  const limited = await request("gps-1");
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "TOO_MANY_REQUESTS");
  assert.ok(limited.headers.get("retry-after"));
  assert.equal((await request("gps-2")).status, 200);
});
