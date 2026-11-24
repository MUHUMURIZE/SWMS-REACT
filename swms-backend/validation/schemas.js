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
  status: { type: "enum", values: statuses },
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
