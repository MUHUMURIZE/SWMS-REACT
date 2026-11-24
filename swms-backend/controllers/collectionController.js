const { pool } = require("../config/db");
const collectionModel = require("../models/collectionModel");
const householdModel = require("../models/householdModel");
const AppError = require("../utils/AppError");
const auditModel = require("../models/auditModel");
const notificationService = require("../services/notificationService");
const binModel = require("../models/binModel");

async function getCurrentProfileId(table, userId) {
  const result = await pool.query(`SELECT id FROM ${table} WHERE user_id = $1`, [userId]);
  return result.rows[0]?.id ?? null;
}

async function getCurrentCompanyId(userId) {
  const result = await pool.query("SELECT company_id FROM representatives WHERE user_id = $1", [userId]);
  return result.rows[0]?.company_id ?? null;
}

async function canAccess(req, collection) {
  if (req.user.role === "ADMIN") return true;
  if (req.user.role === "HOUSEHOLD") {
    return collection.householdId === await getCurrentProfileId("households", req.user.id);
  }
  if (req.user.role === "COLLECTOR") {
    return collection.collectorId === await getCurrentProfileId("collectors", req.user.id);
  }
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    return collection.companyId === await getCurrentCompanyId(req.user.id);
  }
  return false;
}

exports.list = async (req, res) => {
  const scope = {
    role: req.user.role,
    companyId: req.user.role === "COMPANY_REPRESENTATIVE"
      ? await getCurrentCompanyId(req.user.id)
      : null,
    collectorId: req.user.role === "COLLECTOR"
      ? await getCurrentProfileId("collectors", req.user.id)
      : null,
    householdId: req.user.role === "HOUSEHOLD"
      ? await getCurrentProfileId("households", req.user.id)
      : null,
  };
  if (req.user.role !== "ADMIN" && !scope.companyId && !scope.collectorId && !scope.householdId) {
    throw new AppError(404, "User profile not found.", "NOT_FOUND");
  }
  res.json({ data: await collectionModel.list(scope, req.pagination) });
};

exports.get = async (req, res) => {
  const collection = await collectionModel.findById(req.params.id);
  if (!collection || !(await canAccess(req, collection))) {
    throw new AppError(404, "Collection not found.", "NOT_FOUND");
  }
  res.json({ data: collection });
};

exports.create = async (req, res) => {
  const { householdId, collectorId, scheduledAt, status, notes } = req.body;
  const household = await householdModel.findById(householdId);
  const assignedCollectorId = await householdModel.findCollectorId(householdId);
  if (!household || assignedCollectorId !== collectorId) {
    throw new AppError(400, "The household must be assigned to the specified collector.", "VALIDATION_ERROR");
  }
  if (req.user.role === "COMPANY_REPRESENTATIVE"
    && household.companyId !== await getCurrentCompanyId(req.user.id)) {
    throw new AppError(404, "Household not found.", "NOT_FOUND");
  }
  if (req.user.role === "COLLECTOR") {
    const ownCollectorId = await getCurrentProfileId("collectors", req.user.id);
    if (!ownCollectorId || ownCollectorId !== collectorId) {
      throw new AppError(403, "You can create collections only for your households.");
    }
  }
  const collection = await collectionModel.create({
    householdId,
    collectorId,
    scheduledAt,
    status,
    notes,
    createdBy: req.user.id,
  });
  await auditModel.record({
    actorUserId: req.user.id,
    action: "COLLECTION_CREATED",
    resourceType: "COLLECTION",
    resourceId: collection.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ data: collection });
};

exports.update = async (req, res) => {
  const collection = await collectionModel.findById(req.params.id);
  if (!collection || !(await canAccess(req, collection))) {
    throw new AppError(404, "Collection not found.", "NOT_FOUND");
  }
  if (req.user.role === "HOUSEHOLD") {
    throw new AppError(403, "Households can view, but cannot modify, collection records.");
  }
  if (req.body.status !== undefined && req.user.role === "COLLECTOR") {
    if (req.body.householdId !== undefined || req.body.collectorId !== undefined) {
      throw new AppError(403, "Collectors cannot reassign collections.");
    }
  }
  if (req.body.householdId !== undefined || req.body.collectorId !== undefined) {
    throw new AppError(400, "Collection household and collector assignments cannot be changed.");
  }
  const updated = await collectionModel.update(req.params.id, req.body);
  if (req.body.status === "completed") {
    const bin = await binModel.findByHouseholdId(collection.householdId);
    if (bin) {
      await binModel.empty(bin.id);
      await notificationService.notifyCollectionCompleted(collection.householdId, collection.id);
    }
  }
  await auditModel.record({
    actorUserId: req.user.id,
    action: "COLLECTION_UPDATED",
    resourceType: "COLLECTION",
    resourceId: req.params.id,
    ipAddress: req.ip,
  });
  res.json({ data: updated });
};

exports.updateStatus = async (req, res) => {
  const collection = await collectionModel.findById(req.params.id);
  if (!collection || !(await canAccess(req, collection))) {
    throw new AppError(404, "Collection not found.", "NOT_FOUND");
  }
  if (req.user.role === "HOUSEHOLD") {
    throw new AppError(403, "Households cannot update collection status.");
  }
  const updated = await collectionModel.updateStatus(req.params.id, req.body.status);
  if (req.body.status === "completed") {
    const bin = await binModel.findByHouseholdId(collection.householdId);
    if (bin) {
      await binModel.empty(bin.id);
      await notificationService.notifyCollectionCompleted(collection.householdId, collection.id);
    }
  }
  await auditModel.record({
    actorUserId: req.user.id,
    action: "COLLECTION_STATUS_UPDATED",
    resourceType: "COLLECTION",
    resourceId: req.params.id,
    ipAddress: req.ip,
    metadata: { status: req.body.status },
  });
  res.json({ data: updated });
};

exports.remove = async (req, res) => {
  const collection = await collectionModel.findById(req.params.id);
  if (!collection || !(await canAccess(req, collection))) {
    throw new AppError(404, "Collection not found.", "NOT_FOUND");
  }
  if (req.user.role === "HOUSEHOLD") {
    throw new AppError(403, "Households cannot delete collection records.");
  }
  if (["in_progress", "collected", "completed"].includes(collection.status)) {
    throw new AppError(409, "Active or completed collections cannot be deleted.", "CONFLICT");
  }
  await collectionModel.remove(req.params.id);
  await auditModel.record({
    actorUserId: req.user.id,
    action: "COLLECTION_DELETED",
    resourceType: "COLLECTION",
    resourceId: req.params.id,
    ipAddress: req.ip,
  });
  res.status(204).end();
};

exports.myProgress = async (req, res) => {
  const householdId = await getCurrentProfileId("households", req.user.id);
  if (!householdId) throw new AppError(404, "Household profile not found.", "NOT_FOUND");
  res.json({ data: { counts: await collectionModel.getProgress(householdId) } });
};
