const { pool } = require("../config/db");
const householdModel = require("../models/householdModel");
const collectorModel = require("../models/collectorModel");
const { createAccount } = require("./accountService");
const AppError = require("../utils/AppError");

async function getCurrentCollectorId(userId) {
  const result = await pool.query("SELECT id FROM collectors WHERE user_id = $1", [userId]);
  if (!result.rows[0]) throw new AppError(404, "Collector profile not found.", "NOT_FOUND");
  return result.rows[0].id;
}

async function getRepresentative(userId) {
  const result = await pool.query(
    "SELECT company_id FROM representatives WHERE user_id = $1",
    [userId]
  );
  if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
  return result.rows[0];
}

async function findAccessibleHousehold(user, householdId) {
  const household = await householdModel.findById(householdId);
  if (!household) throw new AppError(404, "Household not found.", "NOT_FOUND");

  if (user.role === "ADMIN") return household;
  if (user.role === "COLLECTOR") {
    const collectorId = await getCurrentCollectorId(user.id);
    if (household.collectorId === collectorId) return household;
  } else if (user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await getRepresentative(user.id);
    if (household.companyId === representative.company_id) return household;
  }

  throw new AppError(404, "Household not found.", "NOT_FOUND");
}

exports.list = async (user, pagination = { limit: 50, offset: 0 }) => {
  const useDefaultPagination = pagination.limit === 50 && pagination.offset === 0;
  if (user.role === "ADMIN") return useDefaultPagination ? householdModel.list() : householdModel.list(null, pagination);
  if (user.role === "COLLECTOR") {
    const collectorId = await getCurrentCollectorId(user.id);
    return useDefaultPagination ? householdModel.list(collectorId) : householdModel.list(collectorId, pagination);
  }
  if (user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await getRepresentative(user.id);
    return useDefaultPagination
      ? householdModel.listByCompany(representative.company_id)
      : householdModel.listByCompany(representative.company_id, pagination);
  }
  throw new AppError(403, "You do not have permission to list households.");
};

exports.get = (user, householdId) => findAccessibleHousehold(user, householdId);

exports.create = async (user, data) => {
  let collectorId = data.collectorId;

  if (user.role === "COLLECTOR") {
    if (collectorId !== undefined) {
      throw new AppError(403, "Collectors can only assign households to themselves.");
    }
    collectorId = await getCurrentCollectorId(user.id);
  } else if (user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await getRepresentative(user.id);
    const collector = await collectorModel.findById(collectorId);
    if (!collector || collector.companyId !== representative.company_id) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }
  }

  return createAccount({
    fullName: data.fullName.trim(),
    email: data.email.trim().toLowerCase(),
    passwordHash: data.passwordHash,
    role: "HOUSEHOLD",
    phone: data.phone,
    collectorId,
    address: data.address.trim(),
    nationalId: data.nationalId,
    district: data.district,
    sector: data.sector,
    cell: data.cell,
    village: data.village,
  });
};

exports.update = async (user, householdId, data) => {
  await findAccessibleHousehold(user, householdId);
  return householdModel.update(householdId, data);
};

exports.remove = async (user, householdId) => {
  await findAccessibleHousehold(user, householdId);
  return householdModel.remove(householdId);
};
