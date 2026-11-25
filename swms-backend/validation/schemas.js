const roles = ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR", "HOUSEHOLD"];
const statuses = ["pending", "scheduled", "in_progress", "collected", "completed", "missed", "cancelled"];
const text = (required = false, maxLength = 500) => ({ type: "string", required, maxLength });
const strongPassword = (required = false) => ({ type: "strongPassword", required });
const id = (required = false) => ({ type: "number", required });
const location = {
  district: text(false, 160),
  sector: text(false, 160),
  cell: text(false, 160),
  village: text(false, 160),
};

exports.roles = roles;
exports.statuses = statuses;
exports.initialCollectionStatuses = ["pending", "scheduled"];
exports.login = {
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "password", required: true },
};
exports.account = {
  fullName: { type: "string", required: true, minLength: 1, maxLength: 160 },
  email: { type: "email", required: true, maxLength: 254 },
  password: strongPassword(true),
  role: { type: "enum", required: true, values: roles },
  phone: text(false, 32),
  companyId: id(),
  representativeId: id(),
  collectorId: id(),
  address: text(false),
  nationalId: text(false, 64),
  ...location,
};
exports.profile = {
  fullName: text(false, 160),
  phone: text(false, 32),
};
exports.householdSelf = {
  fullName: text(false, 160),
  phone: text(false, 32),
  address: text(false),
  ...location,
};
exports.company = {
  name: { type: "string", required: true, minLength: 1, maxLength: 160 },
  ...location,
};
exports.district = {
  name: { type: "string", required: true, minLength: 1, maxLength: 160 },
};
exports.districtAgreement = {
  companyId: id(true),
  startsOn: { type: "date", required: true },
  endsOn: { type: "date" },
};
exports.districtAgreementTransition = {
  status: { type: "enum", required: true, values: ["ACTIVE", "SUSPENDED", "TERMINATED"] },
  reason: text(false, 1000),
};
exports.representativeCreate = {
  fullName: text(true, 160),
  email: { type: "email", required: true, maxLength: 254 },
  password: strongPassword(true),
  phone: text(false, 32),
  companyId: id(true),
  ...location,
};
exports.representativeUpdate = {
  fullName: text(false, 160),
  phone: text(false, 32),
  companyId: id(),
  ...location,
};
exports.collectorCreate = {
  fullName: text(true, 160),
  email: { type: "email", required: true, maxLength: 254 },
  password: strongPassword(true),
  phone: text(false, 32),
  representativeId: id(),
  ...location,
};
exports.collectorUpdate = {
  fullName: text(false, 160),
  phone: text(false, 32),
  representativeId: id(),
  ...location,
};
exports.householdCreate = {
  fullName: text(true, 160),
  email: { type: "email", required: true, maxLength: 254 },
  password: strongPassword(true),
  phone: text(false, 32),
  collectorId: id(),
  address: { type: "string", required: true, minLength: 1, maxLength: 500 },
  nationalId: text(false, 64),
  ...location,
};
exports.householdUpdate = {
  fullName: text(false, 160),
  phone: text(false, 32),
  address: text(false),
  nationalId: text(false, 64),
  ...location,
};
exports.changePassword = {
  currentPassword: { type: "password", required: true },
  newPassword: strongPassword(true),
};
exports.collectionCreate = {
  householdId: id(true),
  collectorId: id(true),
  scheduledAt: { type: "datetime", required: true },
  status: { type: "enum", values: exports.initialCollectionStatuses },
  notes: text(false, 5000),
};
exports.collectionUpdate = {
  scheduledAt: { type: "datetime" },
  status: { type: "enum", values: statuses },
  notes: text(false, 5000),
};
exports.collectionStatus = {
  status: { type: "enum", required: true, values: statuses },
};
exports.binCreate = {
  householdId: id(true),
  binCode: { type: "string", required: true, minLength: 1, maxLength: 64 },
  capacity: id(true),
};
exports.binUpdate = {
  binCode: { type: "string", minLength: 1, maxLength: 64 },
  capacity: id(),
};
exports.binProgress = {
  fillLevel: { type: "number", required: true, min: 0, max: 100 },
};
exports.vehicleCreate = {
  companyId: id(),
  registrationNumber: { type: "string", required: true, minLength: 1, maxLength: 32 },
  vehicleType: { type: "string", required: true, minLength: 1, maxLength: 32 },
  make: text(false, 80),
  model: text(false, 80),
  capacity: { type: "decimal", required: true, min: 0.01, max: 9999999999.99, scale: 2 },
  fuelType: {
    type: "enum",
    required: true,
    values: ["DIESEL", "PETROL", "ELECTRIC", "HYBRID", "CNG", "OTHER"],
  },
  registrationExpiresOn: { type: "date" },
  insuranceExpiresOn: { type: "date" },
  inspectionExpiresOn: { type: "date" },
};
exports.vehicleUpdate = {
  registrationNumber: { type: "string", minLength: 1, maxLength: 32 },
  vehicleType: { type: "string", minLength: 1, maxLength: 32 },
  make: text(false, 80),
  model: text(false, 80),
  capacity: { type: "decimal", min: 0.01, max: 9999999999.99, scale: 2 },
  fuelType: {
    type: "enum",
    values: ["DIESEL", "PETROL", "ELECTRIC", "HYBRID", "CNG", "OTHER"],
  },
  registrationExpiresOn: { type: "date" },
  insuranceExpiresOn: { type: "date" },
  inspectionExpiresOn: { type: "date" },
};
exports.vehicleStatus = {
  status: { type: "enum", required: true, values: ["AVAILABLE", "MAINTENANCE", "INACTIVE"] },
};
exports.vehicleAssignment = {
  collectorId: id(true),
};
exports.vehicleMaintenanceCreate = {
  description: { type: "string", required: true, minLength: 1, maxLength: 1000 },
  serviceProvider: text(false, 160),
  scheduledFor: { type: "date", required: true },
  cost: { type: "decimal", min: 0, max: 9999999999.99, scale: 2 },
  odometerKm: { type: "number", min: 0, max: 1000000000 },
};
exports.vehicleMaintenanceStatus = {
  status: { type: "enum", required: true, values: ["COMPLETED", "CANCELLED"] },
};
