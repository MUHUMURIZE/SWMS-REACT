const fs = require("node:fs");
const path = require("node:path");
const swaggerJsdoc = require("swagger-jsdoc");
const schemas = require("../validation/schemas");

const routeFiles = [
  { file: "authRoutes.js", prefix: "/api/auth", tag: "Auth" },
  { file: "companyRoutes.js", prefix: "/api/companies", tag: "Companies" },
  { file: "districtRoutes.js", prefix: "/api/districts", tag: "Districts" },
  { file: "vehicleRoutes.js", prefix: "/api/vehicles", tag: "Fleet Vehicles" },
  { file: "trackingRoutes.js", prefix: "/api/tracking", tag: "GPS Tracking" },
  { file: "iotRoutes.js", prefix: "/api/iot", tag: "Smart Bin IoT" },
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
  authorizeVehicleReader: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
  authorizeVehicleManager: ["ADMIN", "COMPANY_REPRESENTATIVE"],
  authorizeTrackingReader: ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR"],
  authorizeDeviceManager: ["ADMIN", "COMPANY_REPRESENTATIVE"],
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
  "POST /api/districts": { name: "Kayonza" },
  "POST /api/districts/{id}/agreements": {
    companyId: 1,
    startsOn: "2026-12-01",
    endsOn: "2027-11-30",
  },
  "POST /api/districts/agreements/{id}/status": { status: "ACTIVE" },
  "POST /api/vehicles": {
    companyId: 1,
    registrationNumber: "RAB-123A",
    vehicleType: "COMPACTOR",
    make: "Isuzu",
    model: "N-Series",
    capacity: 8500.5,
    fuelType: "DIESEL",
    registrationExpiresOn: "2027-05-31",
  },
  "PUT /api/vehicles/{id}": { insuranceExpiresOn: "2027-08-31" },
  "PUT /api/vehicles/{id}/status": { status: "MAINTENANCE" },
  "PUT /api/vehicles/{id}/assignment": { collectorId: 1 },
  "POST /api/vehicles/{id}/maintenance": {
    description: "Scheduled engine service",
    scheduledFor: "2026-12-10",
    cost: 420.5,
    odometerKm: 18200,
  },
  "PUT /api/vehicles/{id}/maintenance/{maintenanceId}/status": { status: "COMPLETED" },
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
  "POST /api/districts": "Create a district",
  "GET /api/districts": "List national districts and assignment states",
  "GET /api/districts/{id}": "Get a district",
  "POST /api/districts/{id}/agreements": "Create a pending company agreement for a district",
  "GET /api/districts/{id}/agreements": "List district agreement history",
  "GET /api/districts/agreements": "List national agreement history",
  "POST /api/districts/agreements/{id}/status": "Activate, suspend, or terminate a district agreement",
  "GET /api/vehicles": "List fleet vehicles in the user's authorized scope",
  "GET /api/vehicles/{id}": "Get a fleet vehicle",
  "POST /api/vehicles": "Register a fleet vehicle",
  "PUT /api/vehicles/{id}": "Update fleet vehicle details",
  "PUT /api/vehicles/{id}/status": "Change vehicle availability status",
  "PUT /api/vehicles/{id}/assignment": "Assign a vehicle to an authorized collector",
  "DELETE /api/vehicles/{id}/assignment": "Release a vehicle assignment",
  "GET /api/vehicles/{id}/assignments": "View vehicle assignment history",
  "GET /api/vehicles/{id}/maintenance": "View vehicle maintenance history",
  "POST /api/vehicles/{id}/maintenance": "Schedule vehicle maintenance",
  "PUT /api/vehicles/{id}/maintenance/{maintenanceId}/status": "Complete or cancel scheduled maintenance",
  "POST /api/tracking/ingest": "Ingest a GPS location using a hardware device credential",
  "GET /api/tracking/map": "Get current vehicle tracking data in the authorized operating scope",
  "GET /api/tracking/devices": "List GPS devices managed within the caller's company scope",
  "POST /api/tracking/devices": "Register an unassigned GPS device and issue its one-time credential",
  "PUT /api/tracking/devices/{id}/vehicle": "Associate a GPS device with an authorized vehicle",
  "POST /api/tracking/devices/{id}/rotate-credential": "Rotate a GPS device credential",
  "DELETE /api/tracking/devices/{id}": "Revoke a GPS device credential",
  "GET /api/tracking/vehicles/{vehicleId}/location": "Get a vehicle's latest known GPS location and tracking state",
  "GET /api/tracking/vehicles/{vehicleId}/history": "Get paginated GPS location history for an authorized vehicle",
  "POST /api/iot/ingest": "Ingest smart-bin telemetry using a hardware device credential",
  "GET /api/iot/alerts": "List current full-bin, overflow, sensor-fault, and offline-device alerts",
  "GET /api/iot/devices": "List smart-bin devices managed within the caller's company scope",
  "POST /api/iot/devices": "Register an unassigned bin sensor and issue its one-time credential",
  "PUT /api/iot/devices/{id}/bin": "Associate a sensor with an authorized waste bin",
  "POST /api/iot/devices/{id}/rotate-credential": "Rotate a smart-bin device credential",
  "DELETE /api/iot/devices/{id}": "Revoke a smart-bin device credential",
  "GET /api/iot/bins/{binId}/latest": "Get the latest sensor reading and device state for an authorized bin",
  "GET /api/iot/bins/{binId}/readings": "Get paginated sensor history for an authorized bin",
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
  Districts: "district",
  Representatives: "representative",
  Collectors: "collector",
  Households: "household",
  Collections: "collection",
  "Waste Bins": "waste bin",
  "Fleet Vehicles": "fleet vehicle",
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
    } else if (rule.type === "decimal") {
      property.type = "number";
      if (rule.min !== undefined) property.minimum = rule.min;
      if (rule.max !== undefined) property.maximum = rule.max;
      if (rule.scale !== undefined) property.multipleOf = 1 / (10 ** rule.scale);
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
      property.description = "Must include uppercase, lowercase, a number, and a symbol.";
    } else if (rule.type === "datetime") {
      property.type = "string";
      property.format = "date-time";
    } else if (rule.type === "date") {
      property.type = "string";
      property.format = "date";
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
    ?     "Any authenticated role."
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
    createdAt: "2026-11-24T08:00:00.000Z", updatedAt: "2026-11-24T08:00:00.000Z",
  },
  "/api/representatives": {
    id: 1, userId: 2, companyId: 1, companyName: "Green City Waste",
    fullName: "Riley Representative", email: "riley@example.com",
    phone: "+10000000000", ...locationExample,
    createdAt: "2026-11-24T08:00:00.000Z", updatedAt: "2026-11-24T08:00:00.000Z",
  },
  "/api/collectors": {
    id: 1, userId: 3, representativeId: 1, companyId: 1,
    fullName: "Jordan Collector", email: "jordan@example.com",
    phone: "+10000000000", representativeName: "Riley Representative",
    ...locationExample,
    createdAt: "2026-11-24T08:00:00.000Z", updatedAt: "2026-11-24T08:00:00.000Z",
  },
  "/api/households": {
    id: 1, userId: 4, collectorId: 1, address: "10 Main St",
    nationalId: null, fullName: "Taylor Household", email: "taylor@example.com",
    phone: "+10000000000", collectorName: "Jordan Collector", companyId: 1,
    ...locationExample,
    createdAt: "2026-11-24T08:00:00.000Z", updatedAt: "2026-11-24T08:00:00.000Z",
  },
};

const binExample = {
  id: 1,
  householdId: 1,
  binCode: "BIN-0001",
  capacity: 120,
  fillLevel: 85,
  status: "HIGH",
  createdAt: "2026-11-24T08:00:00.000Z",
  updatedAt: "2026-11-24T08:00:00.000Z",
  householdName: "Taylor Household",
  collectorId: 1,
  companyId: 1,
};

const collectionExample = {
  id: 1,
  householdId: 1,
  collectorId: 1,
  scheduledAt: "2026-11-25T09:00:00.000Z",
  status: "scheduled",
  originalScheduledAt: null,
  rescheduledAt: null,
  notes: "Scheduled pickup",
  collectedAt: null,
  createdBy: 2,
  createdAt: "2026-11-24T08:00:00.000Z",
  updatedAt: "2026-11-24T08:00:00.000Z",
  householdName: "Taylor Household",
  collectorName: "Jordan Collector",
  representativeId: 1,
  companyId: 1,
};

const collectionExamplesBySchedule = {
  upcoming: collectionExample,
  missed: { ...collectionExample, status: "missed", scheduledAt: "2026-11-23T09:00:00.000Z" },
  overdue: { ...collectionExample, status: "pending", scheduledAt: "2026-11-23T09:00:00.000Z" },
  rescheduled: {
    ...collectionExample,
    originalScheduledAt: "2026-11-23T09:00:00.000Z",
    rescheduledAt: "2026-11-24T08:00:00.000Z",
  },
};

const districtExample = {
  id: 1,
  name: "Kayonza",
  assignmentStatus: "UNASSIGNED",
  agreementCount: 1,
  activeAgreementCount: 0,
};

const agreementExample = {
  id: 1,
  districtId: 1,
  districtName: "Kayonza",
  companyId: 1,
  companyName: "Green City Waste",
  status: "PENDING",
  startsOn: "2026-12-01",
  endsOn: "2027-11-30",
  activatedAt: null,
  endedAt: null,
};

const vehicleExample = {
  id: 1,
  companyId: 1,
  registrationNumber: "RAB-123A",
  vehicleType: "COMPACTOR",
  make: "Isuzu",
  model: "N-Series",
  capacity: 8500.5,
  fuelType: "DIESEL",
  status: "AVAILABLE",
  registrationExpiresOn: "2027-05-31",
  insuranceExpiresOn: "2027-08-31",
  inspectionExpiresOn: "2027-06-30",
  assignedCollectorId: null,
  assignedCollectorName: null,
};

const maintenanceExample = {
  id: 1,
  description: "Scheduled engine service",
  serviceProvider: "Fleet Service Center",
  scheduledFor: "2026-12-10",
  status: "SCHEDULED",
  cost: 420.5,
  odometerKm: 18200,
  completedAt: null,
};

const completedCollectionExample = {
  ...collectionExample,
  scheduledAt: "2026-11-23T09:00:00.000Z",
  status: "completed",
  collectedAt: "2026-11-23T09:30:00.000Z",
};

const reportExample = {
  totalHouseholds: 42,
  totalBins: 42,
  emptyBins: 8,
  lowBins: 12,
  mediumBins: 10,
  highBins: 8,
  fullBins: 4,
  collectionsCompleted: 120,
  collectionsPending: 14,
  collectionsInProgress: 3,
};

const configuredServerUrl = (process.env.API_SERVER_URL || "").trim();

function exampleForSuccess(method, routePath) {
  if (method === "delete" && routePath !== "/api/vehicles/{id}/assignment") return undefined;
  if (routePath === "/api/vehicles") {
    return { data: method === "get" ? [vehicleExample] : vehicleExample };
  }
  if (routePath === "/api/vehicles/{id}" || routePath === "/api/vehicles/{id}/status"
    || routePath === "/api/vehicles/{id}/assignment") {
    return { data: vehicleExample };
  }
  if (routePath === "/api/vehicles/{id}/assignments") {
    return {
      data: [{
        id: 1,
        collectorId: 1,
        collectorName: "Jordan Collector",
        assignedBy: 2,
        assignedAt: "2026-11-24T08:00:00.000Z",
        unassignedBy: null,
        unassignedAt: null,
      }],
    };
  }
  if (routePath === "/api/vehicles/{id}/maintenance") {
    return {
      data: method === "get"
        ? [maintenanceExample]
        : { ...maintenanceExample, status: "SCHEDULED" },
    };
  }
  if (routePath === "/api/vehicles/{id}/maintenance/{maintenanceId}/status") {
    return { data: { ...maintenanceExample, status: "COMPLETED", completedAt: "2026-12-10T12:00:00.000Z" } };
  }
  if (routePath === "/api/districts") {
    return { data: method === "get" ? [districtExample] : districtExample };
  }
  if (routePath === "/api/districts/agreements"
    || routePath === "/api/districts/{id}/agreements") {
    return { data: method === "get" ? [agreementExample] : agreementExample };
  }
  if (routePath === "/api/districts/agreements/{id}/status") {
    return { data: { ...agreementExample, status: "ACTIVE", activatedAt: "2026-12-01T00:00:00.000Z" } };
  }
  if (routePath === "/api/districts/{id}") return { data: districtExample };
  const profileRoute = Object.keys(profileExamples)
    .find((basePath) => routePath === basePath || routePath === `${basePath}/{id}`);
  if (profileRoute && method === "get" && routePath === profileRoute) {
    return { data: [profileExamples[profileRoute]] };
  }
  if (profileRoute && (method === "get" || method === "post" || method === "put")) {
    return { data: profileExamples[profileRoute] };
  }
  if (method === "get" && ["/api/bins", "/api/bins/full"].includes(routePath)) {
    return { data: [binExample] };
  }
  if (method === "get" && routePath === "/api/notifications") {
    return {
      data: [{
        id: 1,
        userId: 4,
        title: "Collection scheduled",
        message: "A waste collection has been scheduled for 2026-11-25T09:00:00.000Z.",
        readAt: null,
        category: null,
        priority: "normal",
        resourceType: null,
        resourceId: null,
        createdAt: "2026-11-24T08:00:00.000Z",
      }],
    };
  }
  if (routePath === "/api/collections" || routePath === "/api/collections/{id}"
    || routePath === "/api/collections/{id}/status"
    || routePath === "/api/collections/scheduling/upcoming"
    || routePath === "/api/collections/scheduling/missed"
    || routePath === "/api/collections/scheduling/overdue"
    || routePath === "/api/collections/scheduling/rescheduled") {
    if (routePath === "/api/collections/{id}/status") return { data: completedCollectionExample };
    if (routePath.startsWith("/api/collections/scheduling/")) {
      const mode = routePath.split("/").pop();
      return { data: [collectionExamplesBySchedule[mode]] };
    }
    if (routePath === "/api/collections") {
      return { data: method === "get" ? [collectionExample] : collectionExample };
    }
    return { data: collectionExample };
  }
  if (routePath.startsWith("/api/reports/")) {
    return { data: reportExample };
  }
  if (routePath === "/api/my-bin") {
    const { id, householdId, binCode, capacity, fillLevel, status, createdAt, updatedAt } = binExample;
    return { data: { id, householdId, binCode, capacity, fillLevel, status, createdAt, updatedAt } };
  }
  if (routePath === "/api/bins/{id}"
    || routePath === "/api/bins/{id}/progress" || routePath === "/api/bins/{id}/empty") {
    return { data: routePath.endsWith("/empty") ? { ...binExample, fillLevel: 0, status: "EMPTY" } : binExample };
  }
  if (routePath === "/api/bins" && method === "post") {
    return { data: { ...binExample, fillLevel: 0, status: "EMPTY" } };
  }
  if (routePath === "/api/auth/register") {
    return {
      data: {
        id: 1,
        user: {
          id: 3,
          fullName: "Jordan Collector",
          email: "jordan@example.com",
          role: "COLLECTOR",
          phone: "+10000000000",
          createdAt: "2026-11-24T08:00:00.000Z",
          updatedAt: "2026-11-24T08:00:00.000Z",
        },
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
  if (method === "get" && routePath === "/api/dashboard/admin") {
    return {
      data: {
        totalCompanies: 4,
        totalDistricts: 30,
        assignedDistricts: 24,
        unassignedDistricts: 6,
        activeAgreements: 24,
        expiredAgreements: 3,
        suspendedAgreements: 1,
        totalRepresentatives: 4,
        totalCollectors: 18,
        totalHouseholds: 420,
        totalCollections: 850,
        completedCollections: 620,
        pendingCollections: 90,
        inProgressCollections: 12,
        missedCollections: 18,
        overdueCollections: 7,
        emptyBins: 80,
        lowBins: 120,
        mediumBins: 100,
        highBins: 80,
        fullBins: 40,
        topDistricts: [{ district: "Kayonza", count: 120 }],
        topCompanies: [{ company: "Green City Waste", completed: 150, total: 180, completionRate: 83.33 }],
        collectionCompletionRate: 72.94,
        totalBins: 420,
        binsRequiringPickup: 120,
      },
    };
  }
  if (method === "get" && routePath === "/api/dashboard/company") {
    return {
      data: {
        totalCollectors: 8,
        totalHouseholds: 210,
        totalCollections: 420,
        completedCollections: 310,
        pendingCollections: 50,
        inProgressCollections: 8,
        missedCollections: 10,
        overdueCollections: 4,
        fullBinMetrics: 35,
        collectorPerformance: [{
          collector: "Jordan Collector",
          households: 28,
          completedCollections: 42,
          totalCollections: 50,
        }],
        district: "Kayonza",
        sector: "Gahini",
        cell: "Kiyenzi",
        village: "Rugarama",
        completionRate: 73.81,
        totalBins: 210,
        binsRequiringPickup: 62,
      },
    };
  }
  if (method === "get" && routePath === "/api/dashboard/collector") {
    return {
      data: {
        myHouseholds: 28,
        pendingCollections: 8,
        completedCollections: 42,
        inProgressCollections: 2,
        missedCollections: 1,
        overdueCollections: 1,
        binsRequiringImmediatePickup: 6,
        todayCollections: 4,
        district: "Kayonza",
        sector: "Gahini",
        cell: "Kiyenzi",
        village: "Rugarama",
        assignedBins: 28,
        fullBinsRequiringPickup: 6,
      },
    };
  }
  if (method === "get" && routePath === "/api/dashboard/household") {
    return {
      data: {
        district: "Kayonza",
        sector: "Gahini",
        cell: "Kiyenzi",
        village: "Rugarama",
        totalCollections: 8,
        completedCollections: 6,
        pendingCollections: 1,
        inProgressCollections: 0,
        missedCollections: 1,
        binFillTrend: [{
          fillLevel: 85,
          status: "HIGH",
          recordedAt: "2026-11-24T08:00:00.000Z",
        }],
        nextCollection: collectionExample,
        currentCollection: null,
        history: [completedCollectionExample],
        bin: {
          binCode: binExample.binCode,
          capacity: binExample.capacity,
          fillLevel: binExample.fillLevel,
          status: binExample.status,
        },
      },
    };
  }
  if (routePath === "/api/me" || routePath === "/api/households/me") {
    return {
      data: {
        user: {
          id: 4,
          fullName: "Taylor Household",
          email: "taylor@example.com",
          role: "HOUSEHOLD",
          phone: "+10000000000",
          createdAt: "2026-11-24T08:00:00.000Z",
          updatedAt: "2026-11-24T08:00:00.000Z",
        },
        profile: profileExamples["/api/households"],
      },
    };
  }
  if (routePath === "/api/auth/profile" && method === "put") {
    return {
      data: {
        user: {
          id: 3,
          fullName: "Jordan Collector",
          email: "jordan@example.com",
          role: "COLLECTOR",
          phone: "+10000000000",
          createdAt: "2026-11-24T08:00:00.000Z",
          updatedAt: "2026-11-24T08:00:00.000Z",
        },
      },
    };
  }
  if (routePath === "/api/auth/profile") {
    return {
      data: {
        user: {
          id: 3,
          fullName: "Jordan Collector",
          email: "jordan@example.com",
          role: "COLLECTOR",
          phone: "+10000000000",
          createdAt: "2026-11-24T08:00:00.000Z",
          updatedAt: "2026-11-24T08:00:00.000Z",
        },
        profile: profileExamples["/api/collectors"],
      },
    };
  }
  if (routePath === "/health") return { status: "ok" };
  if (routePath === "/api/auth/logout") return { data: { message: "Logged out successfully." } };
  if (routePath === "/api/auth/change-password") {
    return { data: { message: "Password changed. Sign in again to get a new access token." } };
  }
  if (routePath === "/api/notifications/{id}/read")   return { data: { id: 1, read: true } };
  if (routePath === "/api/my-progress") return { data: { counts: [{ status: "completed", count: 3 }] } };
  if (routePath === "/api/my-notifications") {
    return {
      data: [{
        id: 1,
        userId: 4,
        title: "Collection scheduled",
        message: "A waste collection has been scheduled for 2026-11-25T09:00:00.000Z.",
        readAt: null,
        category: null,
        priority: "normal",
        resourceType: null,
        resourceId: null,
        createdAt: "2026-11-24T08:00:00.000Z",
      }],
    };
  }
  return { data: { id: 1, message: "Request completed successfully." } };
}

function successResponse(method, routePath) {
  if (method === "delete" && routePath !== "/api/vehicles/{id}/assignment") {
    return { description: "Resource deleted successfully; no response body." };
  }
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
  const status = routePath === "/api/tracking/ingest" || routePath === "/api/iot/ingest"
    ? "202"
    : method === "post" && !routePath.endsWith("/login") && !routePath.endsWith("/logout")
      ? "201"
      : "200";
  const responseSchema = resourceResponseSchema(method, routePath);
  return {
    description: status === "201" ? "Resource created successfully." : "Request completed successfully.",
    content: {
      "application/json": {
        schema: responseSchema
          ? {
            type: "object",
            required: ["data"],
            properties: { data: responseSchema },
          }
          : { $ref: "#/components/schemas/SuccessResponse" },
        ...(!responseSchema && exampleForSuccess(method, routePath)
          ? { example: exampleForSuccess(method, routePath) }
          : {}),
      },
    },
  };
}

function resourceResponseSchema(method, routePath) {
  const reference = (name) => ({ $ref: `#/components/schemas/${name}` });
  const list = (name) => ({ type: "array", items: reference(name) });
  const paths = {
    "post /api/tracking/ingest": reference("DeviceIngestionReceipt"),
    "get /api/tracking/map": list("VehicleMapEntry"),
    "get /api/tracking/devices": list("ManagedDevice"),
    "post /api/tracking/devices": reference("DeviceEnrollment"),
    "put /api/tracking/devices/{id}/vehicle": reference("ManagedDevice"),
    "post /api/tracking/devices/{id}/rotate-credential": reference("RotatedDeviceCredential"),
    "get /api/tracking/vehicles/{vehicleId}/location": reference("LatestVehicleLocation"),
    "get /api/tracking/vehicles/{vehicleId}/history": list("VehicleLocation"),
    "post /api/iot/ingest": reference("DeviceIngestionReceipt"),
    "get /api/iot/alerts": list("BinAlert"),
    "get /api/iot/devices": list("ManagedDevice"),
    "post /api/iot/devices": reference("DeviceEnrollment"),
    "put /api/iot/devices/{id}/bin": reference("ManagedDevice"),
    "post /api/iot/devices/{id}/rotate-credential": reference("RotatedDeviceCredential"),
    "get /api/iot/bins/{binId}/latest": reference("LatestBinTelemetry"),
    "get /api/iot/bins/{binId}/readings": list("BinTelemetryReading"),
  };
  return paths[`${method} ${routePath}`] || null;
}

function errorResponses(requireHttps = false) {
  const errors = {
    "400": ["Invalid request body or path parameter.", "VALIDATION_ERROR"],
    "401": ["User or device authentication is missing, invalid, expired, or revoked.", "UNAUTHENTICATED"],
    "403": ["The authenticated role or device type cannot perform this action.", "REQUEST_ERROR"],
    "404": ["The resource was not found or is outside the caller's scope.", "NOT_FOUND"],
    "409": ["The request conflicts with an existing record.", "CONFLICT"],
    "500": ["An unexpected server error occurred.", "INTERNAL_SERVER_ERROR"],
  };
  if (requireHttps) {
    errors["426"] = ["Device ingestion requires HTTPS.", "HTTPS_REQUIRED"];
  }
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
        openApiPath === "/api/collections" && method === "post"
          ? "New collections may start only as pending or scheduled."
          : "",
        openApiPath === "/api/collections/{id}/status"
          ? "Transitions are enforced: pending to scheduled/missed/cancelled; scheduled to in_progress/missed/cancelled; in_progress to collected/missed/cancelled; collected to completed."
          : "",
      ].join(" ");
      const operation = {
        tags: [openApiPath === "/api/my-bin" ? "Waste Bins" : routeFile.tag],
        summary,
        description,
        operationId: id,
        ...(pathParameters.length ? { parameters: pathParameters } : {}),
        ...(method === "get" && [
          "/api/companies",
          "/api/vehicles",
          "/api/vehicles/{id}/assignments",
          "/api/vehicles/{id}/maintenance",
          "/api/tracking/devices",
          "/api/tracking/vehicles/{vehicleId}/history",
          "/api/iot/devices",
          "/api/iot/alerts",
          "/api/iot/bins/{binId}/readings",
          "/api/representatives",
          "/api/collectors",
          "/api/households",
          "/api/bins",
          "/api/bins/full",
          "/api/collections",
          "/api/notifications",
          "/api/collections/scheduling/upcoming",
          "/api/collections/scheduling/missed",
          "/api/collections/scheduling/overdue",
          "/api/collections/scheduling/rescheduled",
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
          [method === "delete" ? "204" : routePath === "/api/tracking/ingest"
            || routePath === "/api/iot/ingest" ? "202" : method === "post"
              && routePath !== "/api/auth/login" && routePath !== "/api/auth/logout" ? "201" : "200"]:
            successResponse(method, openApiPath),
          ...errorResponses(/\bauthenticateDevice\b/.test(routeCode)),
        },
      };
      if (/\bauthenticateDevice\b/.test(routeCode)) {
        operation.security = [{ deviceCredential: [] }];
        operation.description = `${summary} Device ingestion requires the enrolled device's X-Device-Credential header; user JWTs are not accepted. The credential is issued once at registration and stored hashed.`;
      } else if (globalGuards.includes("authenticateToken")
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
  servers: [{
    url: configuredServerUrl || "/",
    description: configuredServerUrl ? "Configured API server" : "Same origin as the API documentation",
  }],
  tags: [
    { name: "Auth", description: "Registration, login, and account security." },
    { name: "Companies", description: "Company records; each has at most one Company Representative." },
    { name: "Districts", description: "National districts and historically preserved company operating agreements." },
    { name: "Fleet Vehicles", description: "Company-owned vehicles, collector assignments, maintenance schedules, and service history." },
    { name: "GPS Tracking", description: "Hardware-authenticated vehicle location ingestion and role-scoped tracking history." },
    { name: "Smart Bin IoT", description: "Hardware-authenticated sensor telemetry, history, device status, and active alerts." },
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
      deviceCredential: {
        type: "apiKey",
        in: "header",
        name: "X-Device-Credential",
        description: "One-time-issued, rotatable hardware credential. Never place this secret in frontend code.",
      },
    },
    schemas: {
      DeviceEnrollment: {
        type: "object",
        required: ["id", "deviceCode", "deviceType", "status", "createdAt", "credential"],
        properties: {
          id: { type: "integer" },
          deviceCode: { type: "string" },
          deviceType: { type: "string", enum: ["GPS", "BIN"] },
          status: { type: "string", enum: ["ACTIVE", "REVOKED"] },
          createdAt: { type: "string", format: "date-time" },
          credential: {
            type: "string",
            description: "Returned only at enrollment or rotation; store securely because it cannot be retrieved later.",
          },
        },
      },
      RotatedDeviceCredential: {
        type: "object",
        required: ["id", "credential"],
        properties: {
          id: { type: "integer" },
          credential: { type: "string", description: "New credential returned once; the previous credential is invalidated." },
        },
      },
      ManagedDevice: {
        type: "object",
        required: ["id", "deviceCode", "deviceType", "status", "trackingStatus"],
        properties: {
          id: { type: "integer" },
          deviceCode: { type: "string" },
          deviceType: { type: "string", enum: ["GPS", "BIN"] },
          vehicleId: { type: "integer", nullable: true },
          binId: { type: "integer", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "REVOKED"] },
          trackingStatus: { type: "string", enum: ["ONLINE", "OFFLINE", "REVOKED"] },
          lastCommunicationAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      DeviceIngestionReceipt: {
        type: "object",
        required: ["deviceId", "messageId", "receivedAt", "duplicate"],
        properties: {
          deviceId: { type: "integer" },
          vehicleId: { type: "integer" },
          binId: { type: "integer" },
          messageId: { type: "string" },
          receivedAt: { type: "string", format: "date-time" },
          duplicate: { type: "boolean" },
        },
      },
      GpsPosition: {
        type: "object",
        required: ["latitude", "longitude", "recordedAt", "receivedAt"],
        properties: {
          latitude: { type: "number", minimum: -90, maximum: 90 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          speed: { type: "number", nullable: true, description: "Kilometres per hour." },
          heading: { type: "number", minimum: 0, maximum: 359.99, nullable: true, description: "Degrees clockwise from north." },
          accuracy: { type: "number", minimum: 0, nullable: true, description: "Metres." },
          recordedAt: { type: "string", format: "date-time" },
          receivedAt: { type: "string", format: "date-time" },
        },
      },
      VehicleLocation: {
        type: "object",
        required: ["id", "deviceId", "vehicleId", "messageId", "latitude", "longitude", "recordedAt", "receivedAt"],
        properties: {
          id: { type: "integer" },
          deviceId: { type: "integer" },
          vehicleId: { type: "integer" },
          messageId: { type: "string" },
          latitude: { type: "number", minimum: -90, maximum: 90 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          speed: { type: "number", nullable: true },
          heading: { type: "number", minimum: 0, maximum: 359.99, nullable: true },
          accuracy: { type: "number", minimum: 0, nullable: true },
          recordedAt: { type: "string", format: "date-time" },
          receivedAt: { type: "string", format: "date-time" },
        },
      },
      VehicleMapEntry: {
        type: "object",
        required: ["vehicleId", "registrationNumber", "collectorId", "collectorName", "district",
          "trackingStatus", "lastCommunicationAt", "deviceId", "messageId", "latitude", "longitude",
          "speed", "heading", "accuracy", "recordedAt", "receivedAt"],
        properties: {
          vehicleId: { type: "integer" },
          registrationNumber: { type: "string" },
          companyId: { type: "integer" },
          collectorId: { type: "integer", nullable: true },
          collectorName: { type: "string", nullable: true },
          district: { type: "string", nullable: true },
          trackingStatus: { type: "string", enum: ["NOT_CONFIGURED", "ONLINE", "OFFLINE"] },
          lastCommunicationAt: { type: "string", format: "date-time", nullable: true },
          deviceId: { type: "integer", nullable: true },
          messageId: { type: "string", nullable: true },
          latitude: { type: "number", nullable: true },
          longitude: { type: "number", nullable: true },
          speed: { type: "number", nullable: true },
          heading: { type: "number", nullable: true },
          accuracy: { type: "number", nullable: true },
          recordedAt: { type: "string", format: "date-time", nullable: true },
          receivedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      LatestVehicleLocation: {
        type: "object",
        required: ["vehicleId", "trackingStatus", "lastCommunicationAt", "location"],
        properties: {
          vehicleId: { type: "integer" },
          trackingStatus: { type: "string", enum: ["NOT_CONFIGURED", "ONLINE", "OFFLINE"] },
          lastCommunicationAt: { type: "string", format: "date-time", nullable: true },
          location: { allOf: [{ $ref: "#/components/schemas/GpsPosition" }], nullable: true },
        },
      },
      LatestBinSensorReading: {
        type: "object",
        required: ["fillLevel", "sensorStatus", "overflowDetected", "measuredAt", "receivedAt"],
        properties: {
          fillLevel: { type: "integer", minimum: 0, maximum: 100 },
          batteryLevel: { type: "integer", minimum: 0, maximum: 100, nullable: true },
          sensorStatus: { type: "string", enum: ["OK", "DEGRADED", "FAULT"] },
          overflowDetected: { type: "boolean", nullable: true },
          measuredAt: { type: "string", format: "date-time" },
          receivedAt: { type: "string", format: "date-time" },
        },
      },
      BinTelemetryReading: {
        type: "object",
        required: ["id", "deviceId", "binId", "messageId", "fillLevel", "sensorStatus", "measuredAt", "receivedAt"],
        properties: {
          id: { type: "integer" },
          deviceId: { type: "integer" },
          binId: { type: "integer" },
          messageId: { type: "string" },
          fillLevel: { type: "integer", minimum: 0, maximum: 100 },
          batteryLevel: { type: "integer", minimum: 0, maximum: 100, nullable: true },
          sensorStatus: { type: "string", enum: ["OK", "DEGRADED", "FAULT"] },
          overflowDetected: { type: "boolean", nullable: true, description: "Only populated when supported by a dedicated overflow sensor." },
          measuredAt: { type: "string", format: "date-time" },
          receivedAt: { type: "string", format: "date-time" },
        },
      },
      LatestBinTelemetry: {
        type: "object",
        required: ["binId", "deviceStatus", "lastCommunicationAt", "reading"],
        properties: {
          binId: { type: "integer" },
          deviceStatus: { type: "string", enum: ["NOT_CONFIGURED", "ONLINE", "OFFLINE"] },
          lastCommunicationAt: { type: "string", format: "date-time", nullable: true },
          reading: { allOf: [{ $ref: "#/components/schemas/LatestBinSensorReading" }], nullable: true },
        },
      },
      BinAlert: {
        type: "object",
        required: ["binId", "binCode", "alertType", "lastCommunicationAt", "measuredAt", "fillLevel"],
        properties: {
          binId: { type: "integer" },
          binCode: { type: "string" },
          district: { type: "string", nullable: true },
          alertType: { type: "string", enum: ["FULL", "OVERFLOW", "SENSOR_FAULT", "DEVICE_OFFLINE"] },
          lastCommunicationAt: { type: "string", format: "date-time", nullable: true },
          measuredAt: { type: "string", format: "date-time", nullable: true },
          fillLevel: { type: "integer", minimum: 0, maximum: 100, nullable: true },
        },
      },
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
