const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const { pool } = require("../config/db");
const app = require("../server");

function request(server, path, method = "GET", body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        headers: payload
          ? { "content-type": "application/json", "content-length": payload.length, ...headers }
          : headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("API routes return structured auth, validation, and not-found responses", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const authRequired = await request(server, "/api/auth/profile");
  assert.equal(authRequired.status, 401);
  assert.equal(authRequired.body.error.code, "UNAUTHENTICATED");

  const adminRoute = await request(server, "/api/companies");
  assert.equal(adminRoute.status, 401);

  const invalidLogin = await request(server, "/api/auth/login", "POST", {
    email: "not-an-email",
    password: "short",
  });
  assert.equal(invalidLogin.status, 400);
  assert.equal(invalidLogin.body.error.code, "VALIDATION_ERROR");

  const missingRoute = await request(server, "/not-an-api-route");
  assert.equal(missingRoute.status, 404);
  assert.equal(missingRoute.body.error.code, "NOT_FOUND");

  const swaggerUi = await fetch(`http://127.0.0.1:${server.address().port}/api-docs/`);
  assert.equal(swaggerUi.status, 200);
  assert.match(await swaggerUi.text(), /Swagger UI/);
  const swaggerDocument = await request(server, "/api-docs.json");
  assert.equal(swaggerDocument.status, 200);
  assert.equal(swaggerDocument.body.openapi, "3.0.3");
  assert.ok(swaggerDocument.body.paths["/api/companies"]);
});

test("scheduling endpoints remain reachable through the shared collections mount", async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-signing-secret-with-32-chars";
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  t.mock.method(pool, "query", async (query) => {
    if (query.includes("FROM users u")) {
      return { rows: [{ id: 1, role: "ADMIN", token_version: 0 }] };
    }
    return { rows: [] };
  });

  const token = jwt.sign(
    { id: 1, role: "ADMIN", tokenVersion: 0, jti: randomUUID() },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: process.env.JWT_ISSUER || "swms-api",
      audience: process.env.JWT_AUDIENCE || "swms-api",
      expiresIn: "5m",
    }
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const result = await request(
    server,
    "/api/collections/scheduling/upcoming",
    "GET",
    undefined,
    { authorization: `Bearer ${token}` }
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, []);
});
