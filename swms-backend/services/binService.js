const { pool } = require("../config/db");
const householdModel = require("../models/householdModel");
const binModel = require("../models/binModel");
const collectorModel = require("../models/collectorModel");
const districtAuthorizationService = require("./districtAuthorizationService");
const AppError = require("../utils/AppError");
const notificationModel = require("../models/notificationModel");
const notificationService = require("./notificationService");
const { validateGeoInput } = require("../utils/geo");

async function collectorIdFor(userId) {
  const result = await pool.query("SELECT id FROM collectors WHERE user_id = $1", [userId]);
  if (!result.rows[0]) throw new AppError(404, "Collector profile not found.", "NOT_FOUND");
  return result.rows[0].id;
}

async function companyIdFor(userId) {
  const result = await pool.query("SELECT company_id FROM representatives WHERE user_id = $1", [userId]);
  if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
  return result.rows[0].company_id;
}

function scopeFor(role, id) {
  if (role === "COLLECTOR") return { collectorId: id };
  if (role === "COMPANY_REPRESENTATIVE") return { companyId: id };
  return {};
}

function statusFor(fillLevel) {
  if (fillLevel === 0) return "EMPTY";
  if (fillLevel < 50) return "LOW";
  if (fillLevel < 80) return "MEDIUM";
  if (fillLevel < 100) return "HIGH";
  return "FULL";
}

function districtsMatch(left, right) {
  return typeof left === "string" && typeof right === "string"
    && left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function accessibleBin(user, binId) {
  const bin = await binModel.findById(binId);
  if (!bin) throw new AppError(404, "Waste bin not found.", "NOT_FOUND");
  if (user.role === "ADMIN") return bin;
  if (user.role === "COLLECTOR") {
    const collectorId = await collectorIdFor(user.id);
    const collector = await collectorModel.findById(collectorId);
    if (bin.collectorId === collectorId && collector
      && districtsMatch(bin.district, collector.district)
      && await districtAuthorizationService.companyCanOperateInDistrict(bin.companyId, bin.district)) return bin;
  } else if (user.role === "COMPANY_REPRESENTATIVE") {
    const companyId = await companyIdFor(user.id);
    const collector = await collectorModel.findById(bin.collectorId);
    if (bin.companyId === companyId && collector
      && districtsMatch(bin.district, collector.district)
      && await districtAuthorizationService.companyCanOperateInDistrict(companyId, bin.district)) return bin;
  }
  throw new AppError(404, "Waste bin not found.", "NOT_FOUND");
}

exports.statusFor = statusFor;

exports.list = async (user, fullOnly = false, pagination = { limit: 50, offset: 0 }) => {
  let scope = {};
  if (user.role === "COLLECTOR") scope = scopeFor(user.role, await collectorIdFor(user.id));
  if (user.role === "COMPANY_REPRESENTATIVE") scope = scopeFor(user.role, await companyIdFor(user.id));
  const useDefaultPagination = pagination.limit === 50 && pagination.offset === 0;
  return fullOnly
    ? (useDefaultPagination ? binModel.listFull(scope) : binModel.listFull(scope, pagination))
    : (useDefaultPagination ? binModel.list(scope) : binModel.list(scope, pagination));
};

exports.get = (user, id) => accessibleBin(user, id);

exports.create = async (user, data) => {
  const geo = validateGeoInput(data);
  const household = await householdModel.findById(data.householdId);
  if (!household) throw new AppError(404, "Household not found.", "NOT_FOUND");
  if (user.role === "COLLECTOR") {
    const collectorId = await collectorIdFor(user.id);
    const collector = await collectorModel.findById(collectorId);
    if (household.collectorId !== collectorId || !collector
      || !districtsMatch(household.district, collector.district)
      || !(await districtAuthorizationService.companyCanOperateInDistrict(
        household.companyId,
        household.district
      ))) {
      throw new AppError(404, "Household not found.", "NOT_FOUND");
    }
  } else if (user.role === "COMPANY_REPRESENTATIVE") {
    const companyId = await companyIdFor(user.id);
    const collector = await collectorModel.findById(household.collectorId);
    if (household.companyId !== companyId || !collector
      || !districtsMatch(household.district, collector.district)
      || !(await districtAuthorizationService.companyCanOperateInDistrict(companyId, household.district))) {
      throw new AppError(404, "Household not found.", "NOT_FOUND");
    }
  }
  try {
    return await binModel.create(geo ? { ...data, ...geo } : data);
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "The household already has a bin or the bin code is already in use.", "CONFLICT");
    }
    if (error.code === "23503") {
      throw new AppError(404, "Household not found.", "NOT_FOUND");
    }
    throw error;
  }
};

exports.update = async (user, id, data) => {
  await accessibleBin(user, id);
  const geo = validateGeoInput(data);
  try {
    return await binModel.update(id, geo ? { ...data, ...geo } : data);
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "The bin code is already in use.", "CONFLICT");
    }
    throw error;
  }
};

exports.updateLocation = async (user, id, data) => {
  await accessibleBin(user, id);
  const geo = validateGeoInput(data);
  return binModel.updateLocation(id, geo);
};

exports.remove = async (user, id) => {
  const bin = await accessibleBin(user, id);
  throw new AppError(
    409,
    `Waste bin ${bin.id} cannot be deleted while household ${bin.householdId} exists; every household must retain exactly one bin.`,
    "CONFLICT"
  );
};

exports.updateProgress = async (user, id, fillLevel) => {
  const bin = await accessibleBin(user, id);
  const updated = await binModel.updateProgress(id, fillLevel, statusFor(fillLevel));
  const crossedWarning = bin.fillLevel < 80 && fillLevel >= 80;
  const crossedHigh = bin.fillLevel < 90 && fillLevel >= 90;
  const crossedFull = bin.fillLevel < 100 && fillLevel >= 100;
  if (crossedFull) await notificationService.notifyBinFillLevel(updated, 100);
  else if (crossedHigh) await notificationService.notifyBinFillLevel(updated, 90);
  else if (crossedWarning) await notificationService.notifyBinFillLevel(updated, 80);
  return updated;
};

exports.empty = async (user, id) => {
  await accessibleBin(user, id);
  return binModel.empty(id);
};

exports.myBin = async (userId) => {
  const household = await householdModel.findByUserId(userId);
  if (!household) throw new AppError(404, "Household profile not found.", "NOT_FOUND");
  const bin = await binModel.findByHouseholdId(household.id);
  if (!bin) throw new AppError(404, "Waste bin not found.", "NOT_FOUND");
  const { id, householdId, binCode, capacity, fillLevel, status, createdAt, updatedAt } = bin;
  return {
    id,
    householdId,
    binCode,
    capacity,
    fillLevel,
    status,
    createdAt,
    updatedAt,
    ...(bin.latitude !== undefined ? {
      latitude: bin.latitude,
      longitude: bin.longitude,
      locationAccuracy: bin.locationAccuracy ?? null,
      locationCapturedAt: bin.locationCapturedAt ?? null,
    } : {}),
  };
};

exports.statistics = async (role, userId) => {
  if (role === "ADMIN") return binModel.statistics();
  if (role === "COLLECTOR") {
    return binModel.statistics(scopeFor(role, await collectorIdFor(userId)));
  }
  if (role === "COMPANY_REPRESENTATIVE") {
    return binModel.statistics(scopeFor(role, await companyIdFor(userId)));
  }
  return null;
};
