const fs = require("node:fs");
const path = require("node:path");
const swaggerJsdoc = require("swagger-jsdoc");
const schemas = require("../validation/schemas");

const routeFiles = [
  { file: "authRoutes.js", prefix: "/api/auth", tag: "Auth" },
  { file: "companyRoutes.js", prefix: "/api/companies", tag: "Companies" },
  { file: "representativeRoutes.js", prefix: "/api/representatives", tag: "Representatives" },
  { file: "collectorRoutes.js", prefix: "/api/collectors", tag: "Collectors" },
  { file: "householdRoutes.js", prefix: "/api/households", tag: "Households" },
  { file: "binRoutes.js", prefix: "/api/bins", tag: "Waste Bins" },
  { file: "collectionRoutes.js", prefix: "/api/collections", tag: "Collections" },
  { file: "notificationRoutes.js", prefix: "/api/notifications", tag: "Notifications" },
  { file: "dashboardRoutes.js", prefix: "/api/dashboard", tag: "Dashboards" },
  { file: "selfRoutes.js", prefix: "/api", tag: "Self Service" },
  { file: "reportRoutes.js", prefix: "/api/reports", tag: "Reports" },
  { file: "schedulingRoutes.js", prefix: "/api/collections/scheduling", tag: "Scheduling" },
  { file: "exportRoutes.js", prefix: "/api/exports", tag: "Exports" },
];

const roleDescriptions = {
  ADMIN: "Administrator: full system access.",
  COMPANY_REPRESENTATIVE: "Company Representative: manages their company's collectors, households, and collections.",
  COLLECTOR: "Collector: manages assigned households and collection work.",
  HOUSEHOLD: "Household: accesses its own profile, notifications, and collection information.",
};

const guardRoles = {
  authorizeAdmin: ["ADMIN"],
  authorizeRepresentative: ["COMPANY_REPRESENTATIVE"],
  authorizeCollector: ["COLLECTOR"],
  authorizeHousehold: ["HOUSEHOLD"],
  authorizeAdminOrRepresentative: ["ADMIN", "COMPANY_REPRESENTATIVE"],
  authorizeHouseholdReader: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
  authorizeHouseholdManager: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
  authorizeBinReader: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
  authorizeBinManager: ["ADMIN", "COLLECTOR"],
  authorizeCollectionManager: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
  authorizeCollectionDeleter: ["ADMIN", "COMPANY_REPRESENTATIVE"],
  authorizeExportReader: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
};

const bodyExamples = {
  "POST /api/auth/register": {
    fullName: "Jordan Collector",
    email: "jordan@example.com",
    password: "StrongPass123!",
    role: "COLLECTOR",
    representativeId: 1,
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "POST /api/auth/login": { email: "admin@example.com", password: "your-password" },
  "PUT /api/auth/profile": { fullName: "Jordan Smith", phone: "+10000000000" },
  "PUT /api/auth/change-password": {
    currentPassword: "current-password",
    newPassword: "NewStrong123!",
  },
  "POST /api/companies": {
    name: "Green City Waste",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "PUT /api/companies/{id}": {
    name: "Green City Waste Ltd",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "POST /api/representatives": {
    fullName: "Riley Representative",
    email: "riley@example.com",
    password: "StrongPass123!",
    companyId: 1,
    phone: "+10000000000",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "PUT /api/representatives/{id}": {
    fullName: "Riley R.",
    phone: "+10000000000",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "POST /api/collectors": {
    fullName: "Jordan Collector",
    email: "jordan@example.com",
    password: "StrongPass123!",
    representativeId: 1,
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "PUT /api/collectors/{id}": {
    fullName: "Jordan C.",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "POST /api/households": {
    fullName: "Taylor Household",
    email: "taylor@example.com",
    password: "StrongPass123!",
    collectorId: 1,
    address: "10 Main St",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "POST /api/bins": { householdId: 1, binCode: "BIN-0001", capacity: 120 },
  "PUT /api/bins/{id}": { capacity: 180 },
  "PUT /api/bins/{id}/progress": { fillLevel: 85 },
  "PUT /api/households/{id}": {
    address: "12 Main St",
    phone: "+10000000000",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "PUT /api/households/me": {
    address: "12 Main St",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "PUT /api/me": {
    fullName: "Taylor H.",
    address: "12 Main St",
    district: "Kayonza",
    sector: "Gahini",
    cell: "Kiyenzi",
    village: "Rugarama",
  },
  "POST /api/collections": {
    householdId: 1,
    collectorId: 1,
    scheduledAt: "2026-11-01T09:00:00Z",
    status: "scheduled",
    notes: "Scheduled pickup",
  },
  "PUT /api/collections/{id}": {
    scheduledAt: "2026-11-02T09:00:00Z",
    notes: "Rescheduled",
  },
  "PUT /api/collections/{id}/status": { status: "completed" },
};

const summaries = {
  "POST /api/auth/register": "Register a user account",
  "POST /api/auth/login": "Log in and get a JWT",
  "POST /api/auth/logout": "Log out and revoke the JWT",
  "GET /api/auth/profile": "Get the current user's profile",
  "PUT /api/auth/profile": "Update the current user's profile",
  "PUT /api/auth/change-password": "Change the current user's password",
  "GET /api/me": "Get the current household profile",
  "PUT /api/me": "Update the current household profile",
  "GET /api/my-progress": "Get the current household's collection progress",
  "GET /api/my-notifications": "Get the current household's notifications",
  "GET /api/dashboard/admin": "Get the administrator dashboard",
  "GET /api/dashboard/company": "Get the company dashboard",
  "GET /api/dashboard/collector": "Get the collector dashboard",
  "GET /api/dashboard/household": "Get the household dashboard",
  "PUT /api/notifications/{id}/read": "Mark a notification as read",
  "PUT /api/collections/{id}/status": "Update a collection's status",
  "GET /api/bins/full": "List bins that are high or full",
  "DELETE /api/bins/{id}": "Delete a bin (rejected while its household exists)",
  "PUT /api/bins/{id}/progress": "Update a bin's fill level",
  "PUT /api/bins/{id}/empty": "Mark a bin as emptied",
  "GET /api/my-bin": "Get the authenticated household's bin and fill progress",
};

const singularTags = {
  Companies: "company",
  Representatives: "representative",
  Collectors: "collector",
  Households: "household",
  Collections: "collection",
  "Waste Bins": "waste bin",
  Notifications: "notification",
};

function defaultSummary(method, tag, routePath) {
  const resource = singularTags[tag];
  if (!resource) return `${method[0].toUpperCase()}${method.slice(1)} ${tag.toLowerCase()}`;
  if (method === "get") return routePath.includes("{id}")
    ? `Get a ${resource} by ID`
    : `List ${tag.toLowerCase()}`;
  if (method === "post") return `Create a ${resource}`;
  if (method === "put") return `Update a ${resource}`;
  if (method === "delete") return `Delete a ${resource}`;
  return `${method[0].toUpperCase()}${method.slice(1)} ${resource}`;
}

function toOpenApiPath(routePath) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/$/, "") || "/";
}

function joinRoute(prefix, routePath) {
  if (routePath === "/") return prefix;
  return `${prefix}${routePath}`.replace(/\/$/, "");
}

function schemaToOpenApi(schema) {
  const properties = {};
  const required = [];

  for (const [name, rule] of Object.entries(schema)) {
    const property = {};
    if (rule.type === "number") {
      property.type = "integer";
      property.minimum = rule.min === undefined ? 1 : rule.min;
      if (rule.max !== undefined) property.maximum = rule.max;
    } else if (rule.type === "email") {
      property.type = "string";
      property.format = "email";
    } else if (rule.type === "password") {
      property.type = "string";
      property.format = "password";
      property.minLength = 8;
    } else if (rule.type === "strongPassword") {
      property.type = "string";
      property.format = "password";
      property.minLength = 12;
      property.maxLength = 128;
    } else if (rule.type === "datetime") {
      property.type = "string";
      property.format = "date-time";
    } else if (rule.type === "enum") {
      property.type = "string";
      property.enum = rule.values;
    } else {
      property.type = rule.type;
    }
    if (rule.minLength !== undefined) property.minLength = rule.minLength;
    if (rule.maxLength !== undefined) property.maxLength = rule.maxLength;
    properties[name] = property;
    if (rule.required) required.push(name);
  }

  return {
    type: "object",
    minProperties: 1,
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

function getRequestSchema(routeCode, routePath) {
  const match = routeCode.match(/validateBody\s*\(\s*(?:schemas\.)?([A-Za-z_$][\w$]*)\s*\)/);
  if (!match) return null;
  const schema = schemas[match[1]];
  if (!schema || typeof schema !== "object") {
    throw new Error(`Route references an unknown validation schema: ${match[1]}`);
  }
  const openApiSchema = schemaToOpenApi(schema);
  if (routePath === "/api/auth/register") {
    const roleRequirements = {
      ADMIN: [],
      COMPANY_REPRESENTATIVE: ["companyId"],
      COLLECTOR: ["representativeId"],
      HOUSEHOLD: ["collectorId", "address"],
    };
    return {
      allOf: [
        openApiSchema,
        {
          oneOf: Object.entries(roleRequirements).map(([role, required]) => ({
            properties: { role: { type: "string", enum: [role] } },
            required: ["role", ...required],
          })),
        },
      ],
      description: "Required fields depend on role: COMPANY_REPRESENTATIVE requires companyId; COLLECTOR requires representativeId; HOUSEHOLD requires collectorId and address.",
    };
  }
  return openApiSchema;
}

function findRoleRequirements(routeCode) {
  const match = routeCode.match(/requireRoleFields\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!match) return "";
  const requirements = [];
  for (const roleMatch of match[1].matchAll(/(ADMIN|COMPANY_REPRESENTATIVE|COLLECTOR|HOUSEHOLD)\s*:\s*\[([^\]]*)\]/g)) {
    const fields = [...roleMatch[2].matchAll(/["']([A-Za-z_$][\w$]*)["']/g)].map((field) => field[1]);
    if (fields.length) requirements.push(`${roleMatch[1]} requires ${fields.join(", ")}.`);
  }
  return requirements.length ? ` Conditional required fields: ${requirements.join(" ")}` : "";
}

function getOperationRoles(routeCode, globalGuards) {
  const guardNames = new Set([
    ...globalGuards,
    ...[...routeCode.matchAll(/\b(authorize[A-Za-z_$][\w$]*)\b/g)].map((match) => match[1]),
  ]);
  const roles = new Set();
  for (const guard of guardNames) {
    for (const role of guardRoles[guard] || []) roles.add(role);
  }
  if (roles.size) {
    return [...roles].map((role) => roleDescriptions[role]).join(" ");
  }
  return guardNames.has("authenticateToken")
    ? "Any authenticated role."
    : "Public endpoint.";
}

const locationExample = {
  district: "Kayonza",
  sector: "Gahini",
  cell: "Kiyenzi",
  village: "Rugarama",
};

const profileExamples = {
  "/api/companies": {
    id: 1, name: "Green City Waste", ...locationExample,
  },
  "/api/representatives": {
    id: 1, userId: 2, companyId: 1, companyName: "Green City Waste",
    fullName: "Riley Representative", email: "riley@example.com",
    phone: "+10000000000", ...locationExample,
  },
  "/api/collectors": {
    id: 1, userId: 3, representativeId: 1, companyId: 1,
    fullName: "Jordan Collector", email: "jordan@example.com",
    phone: "+10000000000", representativeName: "Riley Representative",
    ...locationExample,
  },
  "/api/households": {
    id: 1, userId: 4, collectorId: 1, address: "10 Main St",
    nationalId: null, fullName: "Taylor Household", email: "taylor@example.com",
    phone: "+10000000000", collectorName: "Jordan Collector", companyId: 1,
    ...locationExample,
  },
};

function exampleForSuccess(method, routePath) {
  if (method === "delete") return undefined;
  const profileRoute = Object.keys(profileExamples)
    .find((basePath) => routePath === basePath || routePath === `${basePath}/{id}`);
  if (profileRoute && method === "get" && routePath === profileRoute) {
    return { data: [profileExamples[profileRoute]] };
  }
  if (profileRoute && (method === "get" || method === "post" || method === "put")) {
    return { data: profileExamples[profileRoute] };
  }
  if (method === "get" && ["/api/bins", "/api/bins/full", "/api/collections",
    "/api/notifications"].includes(routePath)) {
    return { data: [] };
  }
  if (routePath === "/api/my-bin" || routePath === "/api/bins/{id}"
    || routePath === "/api/bins/{id}/progress" || routePath === "/api/bins/{id}/empty") {
    return {
      data: {
        id: 1,
        householdId: 1,
        binCode: "BIN-0001",
        capacity: 120,
        fillLevel: routePath.endsWith("/empty") ? 0 : 85,
        status: routePath.endsWith("/empty") ? "EMPTY" : "HIGH",
      },
    };
  }
  if (routePath === "/api/bins" && method === "post") {
    return {
      data: {
        id: 1,
        householdId: 1,
        binCode: "BIN-0001",
        capacity: 120,
        fillLevel: 0,
        status: "EMPTY",
      },
    };
  }
  if (routePath === "/api/auth/login") {
    return {
      data: {
        user: { id: 1, fullName: "System Administrator", email: "admin@example.com", role: "ADMIN" },
        accessToken: "YOUR_JWT_TOKEN",
        tokenType: "Bearer",
        expiresIn: 3600,
      },
    };
  }
  if (method === "get" && routePath.startsWith("/api/dashboard/")) {
    return { data: { ...locationExample, message: "Dashboard data for the authenticated role." } };
  }
  if (routePath === "/api/me" || routePath === "/api/households/me") {
    return {
      data: {
        user: { id: 1, fullName: "Taylor Household", email: "taylor@example.com", role: "HOUSEHOLD" },
        profile: { id: 1, ...locationExample },
      },
    };
  }
  if (routePath === "/api/auth/profile") {
    return {
      data: {
        user: { id: 1, fullName: "Jordan Collector", email: "jordan@example.com", role: "COLLECTOR" },
        profile: { id: 1, representativeId: 1, ...locationExample },
      },
    };
  }
  if (routePath === "/health") return { status: "ok" };
  if (routePath === "/api/auth/logout") return { data: { message: "Logged out successfully." } };
  if (routePath === "/api/auth/change-password") {
    return { data: { message: "Password changed. Sign in again to get a new access token." } };
  }
  if (routePath === "/api/notifications/{id}/read") return { data: { id: 1, read: true } };
  if (routePath === "/api/my-progress") return { data: { counts: [{ status: "completed", count: 3 }] } };
  if (routePath === "/api/my-notifications") return { data: [] };
  return { data: { id: 1, message: "Request completed successfully." } };
}

function successResponse(method, routePath) {
  if (method === "delete") return { description: "Resource deleted successfully; no response body." };
  if (routePath === "/api/exports/{resource}/{format}") {
    return {
      description: "The requested resource export file.",
      content: {
        "text/csv": { schema: { type: "string", format: "binary" } },
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
          schema: { type: "string", format: "binary" },
        },
        "application/pdf": { schema: { type: "string", format: "binary" } },
      },
    };
  }
  const status = method === "post" && !routePath.endsWith("/login") && !routePath.endsWith("/logout")
    ? "201"
    : "200";
  return {
    description: status === "201" ? "Resource created successfully." : "Request completed successfully.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SuccessResponse" },
        example: exampleForSuccess(method, routePath),
      },
    },
  };
}

function errorResponses() {
  const errors = {
    "400": ["Invalid request body or path parameter.", "VALIDATION_ERROR"],
    "401": ["Authentication is required or the bearer token is invalid.", "UNAUTHENTICATED"],
    "403": ["The authenticated role cannot perform this action.", "REQUEST_ERROR"],
    "404": ["The resource was not found or is outside the caller's scope.", "NOT_FOUND"],
    "409": ["The request conflicts with an existing record.", "CONFLICT"],
    "500": ["An unexpected server error occurred.", "INTERNAL_SERVER_ERROR"],
  };
  return Object.fromEntries(Object.entries(errors).map(([status, [description, code]]) => [
    status,
    {
      description,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: { code, message: description } },
        },
      },
    },
  ]));
}

function generatePaths() {
  const paths = {};
  for (const routeFile of routeFiles) {
    const source = fs.readFileSync(path.join(__dirname, "..", "routes", routeFile.file), "utf8");
    const declarations = [...source.matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g)];
    const firstDeclaration = declarations[0]?.index ?? source.length;
    const globalGuards = [];
    for (const useMatch of source.slice(0, firstDeclaration).matchAll(/router\.use\s*\(([\s\S]*?)\)\s*;/g)) {
      globalGuards.push(...[...useMatch[1].matchAll(/\b(authenticateToken|authorize[A-Za-z_$][\w$]*)\b/g)]
        .map((match) => match[1]));
    }

    declarations.forEach((declaration, index) => {
      const method = declaration[1].toLowerCase();
      const routePath = joinRoute(routeFile.prefix, declaration[2]);
      const openApiPath = toOpenApiPath(routePath);
      const routeCode = source.slice(
        declaration.index,
        declarations[index + 1]?.index ?? source.length
      );
      const key = `${method.toUpperCase()} ${openApiPath}`;
      const id = `${routeFile.tag.replace(/[^A-Za-z0-9]/g, "")}_${method}_${openApiPath
        .replace(/[{}]/g, "")
        .split("/")
        .filter(Boolean)
        .join("_") || "root"}`;
      const pathParameters = [...openApiPath.matchAll(/\{([^}]+)\}/g)].map((match) => {
        if (openApiPath === "/api/exports/{resource}/{format}" && match[1] === "resource") {
          return {
            name: "resource",
            in: "path",
            required: true,
            description: "Resource to export.",
            schema: {
              type: "string",
              enum: ["companies", "collectors", "households", "bins", "collections"],
            },
            example: "collections",
          };
        }
        if (openApiPath === "/api/exports/{resource}/{format}" && match[1] === "format") {
          return {
            name: "format",
            in: "path",
            required: true,
            description: "Export file format.",
            schema: { type: "string", enum: ["csv", "xlsx", "pdf"] },
            example: "csv",
          };
        }
        return {
          name: match[1],
          in: "path",
          required: true,
          description: `${match[1]} resource identifier.`,
          schema: { type: "integer", minimum: 1 },
          example: 1,
        };
      });
      const requestSchema = getRequestSchema(routeCode, routePath);
      const example = bodyExamples[key];
      const summary = summaries[key] || defaultSummary(method, routeFile.tag, openApiPath);
      const description = [
        summary,
        getOperationRoles(routeCode, globalGuards),
        "Successful JSON responses use a data envelope; errors use an error envelope.",
        findRoleRequirements(routeCode),
      ].join(" ");
      const operation = {
        tags: [openApiPath === "/api/my-bin" ? "Waste Bins" : routeFile.tag],
        summary,
        description,
        operationId: id,
        ...(pathParameters.length ? { parameters: pathParameters } : {}),
        ...(method === "get" && [
          "/api/companies",
          "/api/representatives",
          "/api/collectors",
          "/api/households",
          "/api/bins",
          "/api/bins/full",
          "/api/collections",
          "/api/notifications",
        ].includes(openApiPath) ? {
          parameters: [
            ...(pathParameters),
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            },
            {
              name: "offset",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0, default: 0 },
            },
          ],
        } : {}),
        ...(method === "get" && openApiPath === "/api/reports/collector" ? {
          parameters: [{
            name: "collectorId",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 },
          }],
        } : {}),
        ...(method === "get" && openApiPath === "/api/reports/company" ? {
          parameters: [{
            name: "companyId",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
            description: "Required for administrators; representatives are scoped to their own company.",
          }],
        } : {}),
        ...(method === "get" && openApiPath === "/api/reports/district" ? {
          parameters: [{
            name: "district",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 160 },
          }],
        } : {}),
        ...(method === "get" && openApiPath === "/api/reports/sector" ? {
          parameters: [{
            name: "sector",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 160 },
          }],
        } : {}),
        ...(requestSchema ? {
          requestBody: {
            required: true,
            description: "JSON request body validated by the backend request schema.",
            content: {
              "application/json": {
                schema: requestSchema,
                ...(example ? { example } : {}),
              },
            },
          },
        } : {}),
        responses: {
          [method === "delete" ? "204" : method === "post"
            && routePath !== "/api/auth/login" && routePath !== "/api/auth/logout" ? "201" : "200"]:
            successResponse(method, openApiPath),
          ...errorResponses(),
        },
      };
      if (globalGuards.includes("authenticateToken")
        || /\bauthenticateToken\b/.test(routeCode)) {
        operation.security = [{ bearerAuth: [] }];
      } else {
        operation.security = [];
      }
      paths[openApiPath] ||= {};
      paths[openApiPath][method] = operation;
    });
  }

  paths["/health"] = {
    get: {
      tags: ["Health"],
      summary: "Check API and database health",
      description: "Public endpoint that verifies the API can connect to PostgreSQL.",
      operationId: "health_check",
      security: [],
      responses: {
        "200": {
          description: "The API and database are healthy.",
          content: { "application/json": { example: { status: "ok" } } },
        },
        ...errorResponses(),
      },
    },
  };
  return paths;
}

const definition = {
  openapi: "3.0.3",
  info: {
    title: "Smart Waste Management System API",
    version: "1.0.0",
    description: [
      "Interactive API documentation and testing for the Smart Waste Management System.",
      "Authenticate with a bearer JWT using the Authorize button. Log in first, copy `data.accessToken`, then paste the token into Authorize.",
      "Protected endpoints describe the required roles. Request body schemas are generated from `validation/schemas.js` and route definitions are scanned from `routes/`.",
    ].join("\n\n"),
  },
  servers: [{ url: "http://localhost:3000", description: "Local development server" }],
  tags: [
    { name: "Auth", description: "Registration, login, and account security." },
    { name: "Companies", description: "Company records; each has at most one Company Representative." },
    { name: "Representatives", description: "Company Representative accounts managed by administrators." },
    { name: "Collectors", description: "Collectors assigned to a company representative." },
    { name: "Households", description: "Households managed by their collector, company representative, or administrator." },
    { name: "Waste Bins", description: "Waste bin assignment, ownership, and fill progress." },
    { name: "Collections", description: "Waste collection scheduling, status, and history." },
    { name: "Notifications", description: "Notifications for the authenticated user." },
    { name: "Dashboards", description: "Role-specific dashboard summaries." },
    { name: "Self Service", description: "Household self-service profile and progress." },
    { name: "Health", description: "API health check." },
    { name: "Reports", description: "Role-scoped operational waste management reports." },
    { name: "Scheduling", description: "Upcoming, missed, overdue, and rescheduled collections." },
    { name: "Exports", description: "CSV, Excel, and PDF data exports." },
  ],
  paths: generatePaths(),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste the JWT access token returned by POST /api/auth/login. Swagger adds the Bearer prefix.",
      },
    },
    schemas: {
      SuccessResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            description: "The endpoint's result.",
            oneOf: [{ type: "object" }, { type: "array", items: {} }],
          },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({
  definition,
  apis: routeFiles.map(({ file }) => path.join(__dirname, "..", "routes", file)),
});

module.exports = swaggerSpec;
