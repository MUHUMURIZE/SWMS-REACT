const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const app = require("../server");

function request(server, path, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        headers: payload
          ? { "content-type": "application/json", "content-length": payload.length }
          : {},
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
