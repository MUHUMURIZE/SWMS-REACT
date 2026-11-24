const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const swaggerSpec = require("../docs/openapi");

test("OpenAPI includes every route declared in the backend route files", () => {
  const routeDirectory = path.join(__dirname, "..", "routes");
  const routeFiles = fs.readdirSync(routeDirectory).filter((file) => file.endsWith("Routes.js"));
  let routeCount = 0;

  for (const file of routeFiles) {
    const source = fs.readFileSync(path.join(routeDirectory, file), "utf8");
    const prefix = {
      authRoutes: "/api/auth",
      companyRoutes: "/api/companies",
      representativeRoutes: "/api/representatives",
      collectorRoutes: "/api/collectors",
      householdRoutes: "/api/households",
      binRoutes: "/api/bins",
      collectionRoutes: "/api/collections",
      notificationRoutes: "/api/notifications",
      dashboardRoutes: "/api/dashboard",
      selfRoutes: "/api",
      reportRoutes: "/api/reports",
      schedulingRoutes: "/api/collections/scheduling",
      exportRoutes: "/api/exports",
    }[file.replace(".js", "")];
    for (const [, method, suffix] of source.matchAll(
      /router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g
    )) {
      routeCount += 1;
      const route = `${prefix}${suffix === "/" ? "" : suffix}`.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      assert.ok(swaggerSpec.paths[route]?.[method], `Missing OpenAPI operation ${method.toUpperCase()} ${route}`);
    }
  }

  const documentedCount = Object.values(swaggerSpec.paths)
    .reduce((count, item) => count + Object.keys(item).length, 0);
  assert.equal(documentedCount, routeCount + 1, "All route operations and GET /health are documented");
});

test("OpenAPI provides JWT authorization and validation-backed request schemas", () => {
  assert.deepEqual(swaggerSpec.components.securitySchemes.bearerAuth, {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Paste the JWT access token returned by POST /api/auth/login. Swagger adds the Bearer prefix.",
  });
  assert.deepEqual(swaggerSpec.paths["/api/auth/login"].post.security, []);
  assert.deepEqual(swaggerSpec.paths["/api/companies"].get.security, [{ bearerAuth: [] }]);

  const companySchema = swaggerSpec.paths["/api/companies"].post.requestBody.content["application/json"].schema;
  assert.deepEqual(companySchema.required, ["name"]);
  assert.equal(companySchema.minProperties, 1);
  assert.equal(companySchema.properties.name.maxLength, 160);
  for (const field of ["district", "sector", "cell", "village"]) {
    assert.equal(companySchema.properties[field].type, "string");
    assert.equal(companySchema.properties[field].maxLength, 160);
  }

  const registrationSchema = swaggerSpec.paths["/api/auth/register"].post.requestBody.content["application/json"].schema;
  assert.equal(registrationSchema.allOf[1].oneOf.length, 4);
  assert.ok(swaggerSpec.paths["/api/collections/{id}/status"].put.requestBody);
  assert.ok(swaggerSpec.paths["/api/dashboard/company"].get.description.includes("Company Representative"));
});

test("location fields appear in create, update, and resource response examples", () => {
  const fields = ["district", "sector", "cell", "village"];
  const resourcePaths = [
    ["/api/companies", "post", "get"],
    ["/api/representatives", "post", "get"],
    ["/api/collectors", "post", "get"],
    ["/api/households", "post", "get"],
  ];

  for (const [route, createMethod, listMethod] of resourcePaths) {
    const createExample = swaggerSpec.paths[route][createMethod]
      .requestBody.content["application/json"].example;
    for (const field of fields) assert.ok(field in createExample, `${route} example is missing ${field}`);

    const listExample = swaggerSpec.paths[route][listMethod]
      .responses["200"].content["application/json"].example;
    for (const field of fields) assert.ok(field in listExample.data[0], `${route} response is missing ${field}`);
  }

  for (const route of [
    "/api/companies/{id}",
    "/api/representatives/{id}",
    "/api/collectors/{id}",
    "/api/households/{id}",
  ]) {
    const updateExample = swaggerSpec.paths[route].put
      .requestBody.content["application/json"].example;
    for (const field of fields) assert.ok(field in updateExample, `${route} example is missing ${field}`);
  }

  const selfUpdateExample = swaggerSpec.paths["/api/households/me"].put
    .requestBody.content["application/json"].example;
  for (const field of fields) assert.ok(field in selfUpdateExample, `/api/households/me is missing ${field}`);

  const profileExample = swaggerSpec.paths["/api/auth/profile"].get
    .responses["200"].content["application/json"].example;
  for (const field of fields) assert.ok(field in profileExample.data.profile, `/api/auth/profile is missing ${field}`);
});

test("OpenAPI documents waste bin routes, fill-level limits, tags, and examples", () => {
  const expectedBinOperations = {
    "/api/bins": ["post", "get"],
    "/api/bins/full": ["get"],
    "/api/bins/{id}": ["get", "put", "delete"],
    "/api/bins/{id}/progress": ["put"],
    "/api/bins/{id}/empty": ["put"],
    "/api/my-bin": ["get"],
  };
  for (const [route, methods] of Object.entries(expectedBinOperations)) {
    for (const method of methods) {
      assert.ok(swaggerSpec.paths[route]?.[method], `Missing ${method.toUpperCase()} ${route}`);
      assert.ok(swaggerSpec.paths[route][method].tags.includes("Waste Bins"));
    }
  }
  assert.ok(swaggerSpec.tags.some((tag) => tag.name === "Waste Bins"));
  const progress = swaggerSpec.paths["/api/bins/{id}/progress"].put;
  const schema = progress.requestBody.content["application/json"].schema;
  assert.equal(schema.properties.fillLevel.minimum, 0);
  assert.equal(schema.properties.fillLevel.maximum, 100);
  assert.deepEqual(progress.requestBody.content["application/json"].example, { fillLevel: 85 });
  assert.equal(swaggerSpec.paths["/api/bins/{id}/empty"].put.responses["200"].content["application/json"].example.data.status, "EMPTY");
  assert.ok(swaggerSpec.paths["/api/bins/full"].get.responses["200"].content["application/json"].example);
});

test("generated OpenAPI has valid paths and no escaped HTML or markup artifacts", () => {
  const document = JSON.stringify(swaggerSpec);
  const openapiSource = fs.readFileSync(path.join(__dirname, "..", "docs", "openapi.js"), "utf8");
  assert.doesNotMatch(document, /&(?:gt|lt|amp|quot|#\d+);|<a\b|<\/?[A-Za-z][^>]*>/i);
  assert.doesNotMatch(openapiSource, /&(?:gt|lt|amp|quot|#\d+);|<a\b|<\/?[A-Za-z][^>]*>/i);

  const operationIds = new Set();
  for (const [route, pathItem] of Object.entries(swaggerSpec.paths)) {
    assert.ok(route.startsWith("/"), `Invalid OpenAPI path: ${route}`);
    assert.doesNotMatch(route, /:[A-Za-z_]/, `Express parameter not converted in ${route}`);
    for (const [method, operation] of Object.entries(pathItem)) {
      assert.ok(["get", "post", "put", "patch", "delete"].includes(method));
      assert.ok(operation.operationId);
      assert.ok(!operationIds.has(operation.operationId), `Duplicate operationId ${operation.operationId}`);
      operationIds.add(operation.operationId);
      assert.ok(operation.responses && Object.keys(operation.responses).length > 0);
      for (const tag of operation.tags) {
        assert.ok(swaggerSpec.tags.some((definition) => definition.name === tag), `Undefined tag ${tag}`);
      }
    }
  }
});

test("export OpenAPI uses resource and format string enums with file responses", () => {
  const operation = swaggerSpec.paths["/api/exports/{resource}/{format}"].get;
  const parameters = Object.fromEntries(operation.parameters.map((parameter) => [parameter.name, parameter]));
  assert.equal(parameters.resource.schema.type, "string");
  assert.deepEqual(parameters.resource.schema.enum, [
    "companies", "collectors", "households", "bins", "collections",
  ]);
  assert.equal(parameters.format.schema.type, "string");
  assert.deepEqual(parameters.format.schema.enum, ["csv", "xlsx", "pdf"]);
  assert.deepEqual(
    Object.keys(operation.responses["200"].content).sort(),
    [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ].sort()
  );
  assert.match(operation.description, /Collector: manages assigned households/);
});

test("OpenAPI documents scheduling pagination and realistic workflow examples", () => {
  for (const mode of ["upcoming", "missed", "overdue", "rescheduled"]) {
    const operation = swaggerSpec.paths[`/api/collections/scheduling/${mode}`].get;
    const parameters = Object.fromEntries(operation.parameters.map((parameter) => [parameter.name, parameter]));
    assert.equal(parameters.limit.schema.default, 50);
    assert.equal(parameters.limit.schema.maximum, 200);
    assert.equal(parameters.offset.schema.default, 0);
    const example = operation.responses["200"].content["application/json"].example.data[0];
    assert.equal(typeof example.householdId, "number");
    assert.equal(typeof example.collectorId, "number");
    assert.equal(example.status, {
      upcoming: "scheduled",
      missed: "missed",
      overdue: "pending",
      rescheduled: "scheduled",
    }[mode]);
  }

  const report = swaggerSpec.paths["/api/reports/district"].get
    .responses["200"].content["application/json"].example.data;
  assert.equal(typeof report.totalHouseholds, "number");
  assert.equal(typeof report.collectionsCompleted, "number");

  const completion = swaggerSpec.paths["/api/collections/{id}/status"].put
    .responses["200"].content["application/json"].example.data;
  assert.equal(completion.status, "completed");
  assert.equal(typeof completion.householdName, "string");
});

test("OpenAPI examples match collection and profile response shapes", () => {
  const collectionCreate = swaggerSpec.paths["/api/collections"].post;
  assert.deepEqual(
    collectionCreate.requestBody.content["application/json"].schema.properties.status.enum,
    ["pending", "scheduled"]
  );
  assert.match(collectionCreate.description, /start only as pending or scheduled/);

  const collectionList = swaggerSpec.paths["/api/collections"].get
    .responses["200"].content["application/json"].example.data;
  const collectionDetail = swaggerSpec.paths["/api/collections/{id}"].get
    .responses["200"].content["application/json"].example.data;
  assert.ok(Array.isArray(collectionList));
  assert.equal(Array.isArray(collectionDetail), false);

  const profileUpdate = swaggerSpec.paths["/api/auth/profile"].put
    .responses["200"].content["application/json"].example.data;
  assert.ok(profileUpdate.user);
  assert.equal("profile" in profileUpdate, false);
});

test("OpenAPI server URL can be configured from the environment", () => {
  const modulePath = require.resolve("../docs/openapi");
  const originalUrl = process.env.API_SERVER_URL;
  process.env.API_SERVER_URL = "https://api.example.test";
  delete require.cache[modulePath];
  try {
    assert.equal(require("../docs/openapi").servers[0].url, "https://api.example.test");
  } finally {
    if (originalUrl === undefined) delete process.env.API_SERVER_URL;
    else process.env.API_SERVER_URL = originalUrl;
    delete require.cache[modulePath];
    require("../docs/openapi");
  }
});
