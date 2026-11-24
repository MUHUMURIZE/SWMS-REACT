const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { validateBody, validateId } = require("../middleware/validate");
const { errorHandler } = require("../middleware/errorMiddleware");
const { loginRateLimitKeyGenerator } = require("../middleware/loginRateLimiter");
const { trustedProxyHops } = require("../config/proxy");

function run(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => (error ? reject(error) : resolve(req)));
  });
}

test("strong account passwords require length and character diversity", async () => {
  await run(validateBody({
    password: { type: "strongPassword", required: true },
  }), { body: { password: "StrongPass123!" } });

  await assert.rejects(
    run(validateBody({
      password: { type: "strongPassword", required: true },
    }), { body: { password: "weakpassword" } }),
    (error) => error.statusCode === 400 && error.code === "VALIDATION_ERROR"
  );
});

test("pagination rejects invalid limits and offsets", async () => {
  const validatePagination = require("../middleware/pagination");
  await assert.rejects(
    run(validatePagination, { query: { limit: "201", offset: "0" } }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    run(validatePagination, { query: { limit: "50", offset: "-1" } }),
    (error) => error.statusCode === 400
  );
});

test("login rate-limit keys use the normalized client IP and email", () => {
  const first = loginRateLimitKeyGenerator({
    ip: "192.0.2.10",
    body: { email: "  User@Example.com " },
  });
  const otherIp = loginRateLimitKeyGenerator({
    ip: "192.0.2.11",
    body: { email: "user@example.com" },
  });
  assert.equal(first, "192.0.2.10:user@example.com");
  assert.notEqual(first, otherIp);
});

test("trusted proxy configuration accepts only a non-negative hop count", () => {
  assert.equal(trustedProxyHops(undefined), 0);
  assert.equal(trustedProxyHops("2"), 2);
  assert.throws(() => trustedProxyHops("true"), /non-negative integer/);
  assert.throws(() => trustedProxyHops("-1"), /non-negative integer/);
});

test("production login throttling refuses to start without shared Redis storage", () => {
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.REDIS_URL;
  const result = spawnSync(
    process.execPath,
    ["-e", "require('./middleware/loginRateLimiter')"],
    { cwd: path.join(__dirname, ".."), env, encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REDIS_URL must be configured in production/);
});

test("JWTs use the configured issuer audience and HS256 algorithm", () => {
  const secret = "test-secret-that-is-at-least-32-characters";
  const token = jwt.sign(
    { id: 1, jti: "00000000-0000-4000-8000-000000000000" },
    secret,
    { algorithm: "HS256", issuer: "swms-api", audience: "swms-api", expiresIn: "1h" }
  );
  assert.equal(
    jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: "swms-api",
      audience: "swms-api",
    }).id,
    1
  );
  assert.throws(() => jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: "wrong-issuer",
    audience: "swms-api",
  }));
});

test("PostgreSQL constraint errors map to explicit API responses", () => {
  for (const [code, status, responseCode] of [
    ["23505", 409, "CONFLICT"],
    ["23503", 409, "CONFLICT"],
    ["23514", 400, "VALIDATION_ERROR"],
  ]) {
    const response = {
      statusCode: null,
      body: null,
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; },
    };
    errorHandler({ code, message: "constraint" }, {}, response, () => {});
    assert.equal(response.statusCode, status);
    assert.equal(response.body.error.code, responseCode);
  }
});

