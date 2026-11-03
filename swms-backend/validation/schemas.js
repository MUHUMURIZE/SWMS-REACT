const roles = ["ADMIN", "COMPANY_REPRESENTATIVE", "COLLECTOR", "HOUSEHOLD"];
const statuses = ["pending", "scheduled", "in_progress", "collected", "completed", "missed"];
const text = (required = false, maxLength = 500) => ({ type: "string", required, maxLength });
const id = (required = false) => ({ type: "number", required });

exports.roles = roles;
exports.statuses = statuses;
exports.login = {
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "password", required: true },
};
exports.account = {
  fullName: { type: "string", required: true, minLength: 1, maxLength: 160 },
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "password", required: true },
  role: { type: "enum", required: true, values: roles },
  phone: text(false, 32),
  companyId: id(),
  representativeId: id(),
  collectorId: id(),
  address: text(false),
  nationalId: text(false, 64),
};
exports.profile = {
  fullName: text(false, 160),
  phone: text(false, 32),
};
exports.householdSelf = {
  fullName: text(false, 160),
  phone: text(false, 32),
  address: text(false),
};
exports.company = { name: { type: "string", required: true, minLength: 1, maxLength: 160 } };
exports.representativeCreate = {
  fullName: text(true, 160),
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "password", required: true },
  phone: text(false, 32),
  companyId: id(true),
};
exports.representativeUpdate = {
  fullName: text(false, 160),
  phone: text(false, 32),
  companyId: id(),
};
exports.collectorCreate = {
  fullName: text(true, 160),
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "password", required: true },
  phone: text(false, 32),
  representativeId: id(),
};
exports.collectorUpdate = {
  fullName: text(false, 160),
  phone: text(false, 32),
  representativeId: id(),
};
exports.householdCreate = {
  fullName: text(true, 160),
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "password", required: true },
  phone: text(false, 32),
  collectorId: id(),
  address: { type: "string", required: true, minLength: 1, maxLength: 500 },
  nationalId: text(false, 64),
};
exports.householdUpdate = {
  fullName: text(false, 160),
  phone: text(false, 32),
  address: text(false),
  nationalId: text(false, 64),
};
exports.changePassword = {
  currentPassword: { type: "password", required: true },
  newPassword: { type: "password", required: true },
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
