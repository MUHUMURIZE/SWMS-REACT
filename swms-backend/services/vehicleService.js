const { pool } = require("../config/db");
const vehicleModel = require("../models/vehicleModel");
const companyModel = require("../models/companyModel");
const collectorModel = require("../models/collectorModel");
const districtAuthorizationService = require("./districtAuthorizationService");
const auditModel = require("../models/auditModel");
const runTransaction = require("../utils/transaction");
const AppError = require("../utils/AppError");

async function profileId(table, userId) {
  const result = await pool.query(`SELECT id FROM ${table} WHERE user_id = $1`, [userId]);
  return result.rows[0]?.id ?? null;
}

async function companyIdFor(userId) {
  const result = await pool.query("SELECT company_id FROM representatives WHERE user_id = $1", [userId]);
  if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
  return result.rows[0].company_id;
}

async function accessible(user, vehicle) {
  if (user.role === "ADMIN") return true;
  if (user.role === "COMPANY_REPRESENTATIVE") {
    return vehicle.companyId === await companyIdFor(user.id);
  }
  if (user.role === "COLLECTOR") {
    const collectorId = await profileId("collectors", user.id);
    return vehicle.assignedCollectorId === collectorId
      && Boolean(vehicle.assignedCollectorDistrict)
      && await districtAuthorizationService.companyCanOperateInDistrict(
        vehicle.companyId,
        vehicle.assignedCollectorDistrict
      );
  }
  return false;
}

async function findAccessible(user, id, executor = pool, lock = false) {
  const vehicle = await vehicleModel.findById(id, executor, lock);
  if (!vehicle || !(await accessible(user, vehicle))) {
    throw new AppError(404, "Vehicle not found.", "NOT_FOUND");
  }
  return vehicle;
}

function assertFleetManager(user) {
  if (!["ADMIN", "COMPANY_REPRESENTATIVE"].includes(user.role)) {
    throw new AppError(403, "You do not have permission to manage fleet vehicles.", "FORBIDDEN");
  }
}

function translatePersistenceError(error) {
  if (error.code === "23505") {
    throw new AppError(409, "The registration number or collector assignment is already in use.", "CONFLICT");
  }
  if (error.code === "23514") {
    throw new AppError(409, "The vehicle assignment violates fleet or district authorization rules.", "CONFLICT");
  }
  throw error;
}

exports.list = async (user, pagination) => {
  if (user.role === "ADMIN") return vehicleModel.list({}, pagination);
  if (user.role === "COMPANY_REPRESENTATIVE") {
    return vehicleModel.list({ companyId: await companyIdFor(user.id) }, pagination);
  }
  if (user.role === "COLLECTOR") {
    const collectorId = await profileId("collectors", user.id);
    if (!collectorId) throw new AppError(404, "Collector profile not found.", "NOT_FOUND");
    return vehicleModel.list({ collectorId }, pagination);
  }
  throw new AppError(403, "You do not have permission to view fleet vehicles.", "FORBIDDEN");
};

exports.get = async (user, id) => findAccessible(user, id);

exports.create = async (user, data) => {
  assertFleetManager(user);
  let companyId = data.companyId;
  if (user.role === "COMPANY_REPRESENTATIVE") {
    if (data.companyId !== undefined) {
      throw new AppError(403, "Company representatives cannot select another vehicle owner.", "FORBIDDEN");
    }
    companyId = await companyIdFor(user.id);
  }
  if (!(await companyModel.findById(companyId))) {
    throw new AppError(404, "Company not found.", "NOT_FOUND");
  }

  try {
    return await runTransaction(async (client) => {
      const id = await vehicleModel.create(client, {
        ...data,
        companyId,
        createdBy: user.id,
      });
      await auditModel.record({
        actorUserId: user.id,
        action: "VEHICLE_CREATED",
        resourceType: "FLEET_VEHICLE",
        resourceId: id,
      }, client);
      return vehicleModel.findById(id, client);
    });
  } catch (error) {
    translatePersistenceError(error);
  }
};

exports.update = async (user, id, data) => {
  assertFleetManager(user);
  try {
    return await runTransaction(async (client) => {
      await findAccessible(user, id, client, true);
      const vehicle = await vehicleModel.update(client, id, data);
      await auditModel.record({
        actorUserId: user.id,
        action: "VEHICLE_UPDATED",
        resourceType: "FLEET_VEHICLE",
        resourceId: id,
        metadata: data,
      }, client);
      return vehicle;
    });
  } catch (error) {
    translatePersistenceError(error);
  }
};

exports.setStatus = async (user, id, status) => {
  assertFleetManager(user);
  return runTransaction(async (client) => {
    const vehicle = await findAccessible(user, id, client, true);
    if (vehicle.assignedCollectorId !== null) {
      throw new AppError(409, "Unassign the vehicle before changing its availability status.", "CONFLICT");
    }
    if (vehicle.status !== status) {
      await vehicleModel.setStatus(client, id, status);
      await auditModel.record({
        actorUserId: user.id,
        action: "VEHICLE_STATUS_CHANGED",
        resourceType: "FLEET_VEHICLE",
        resourceId: id,
        metadata: { previousStatus: vehicle.status, status },
      }, client);
    }
    return vehicleModel.findById(id, client);
  });
};

exports.assign = async (user, id, collectorId) => {
  assertFleetManager(user);
  try {
    return await runTransaction(async (client) => {
      const vehicle = await findAccessible(user, id, client, true);
      if (["MAINTENANCE", "INACTIVE"].includes(vehicle.status)) {
        throw new AppError(409, "Only an available vehicle can be assigned.", "CONFLICT");
      }
      const collector = await collectorModel.findById(collectorId, client);
      if (!collector || collector.companyId !== vehicle.companyId) {
        throw new AppError(404, "Collector not found for this company.", "NOT_FOUND");
      }
      if (!(await districtAuthorizationService.companyCanOperateInDistrict(
        vehicle.companyId,
        collector.district,
        client
      ))) {
        throw new AppError(403, "The collector's district is not authorized for this company.", "FORBIDDEN");
      }
      if (vehicle.assignedCollectorId === collectorId) return vehicle;

      if (vehicle.assignedCollectorId !== null) {
        await vehicleModel.closeAssignment(client, id, user.id);
      }
      const updated = await vehicleModel.assign(client, id, collectorId);
      await vehicleModel.recordAssignment(client, id, collectorId, collector.fullName, user.id);
      await auditModel.record({
        actorUserId: user.id,
        action: "VEHICLE_ASSIGNED",
        resourceType: "FLEET_VEHICLE",
        resourceId: id,
        metadata: {
          previousCollectorId: vehicle.assignedCollectorId,
          collectorId,
          companyId: vehicle.companyId,
        },
      }, client);
      return updated;
    });
  } catch (error) {
    translatePersistenceError(error);
  }
};

exports.unassign = async (user, id) => {
  assertFleetManager(user);
  return runTransaction(async (client) => {
    const vehicle = await findAccessible(user, id, client, true);
    if (vehicle.assignedCollectorId === null) return vehicle;
    await vehicleModel.closeAssignment(client, id, user.id);
    const updated = await vehicleModel.setStatus(client, id, "AVAILABLE");
    await auditModel.record({
      actorUserId: user.id,
      action: "VEHICLE_UNASSIGNED",
      resourceType: "FLEET_VEHICLE",
      resourceId: id,
      metadata: { collectorId: vehicle.assignedCollectorId },
    }, client);
    return updated;
  });
};

exports.assignmentHistory = async (user, id, pagination) => {
  await findAccessible(user, id);
  return vehicleModel.listAssignmentHistory(id, pagination);
};

exports.maintenanceHistory = async (user, id, pagination) => {
  await findAccessible(user, id);
  return vehicleModel.listMaintenance(id, pagination);
};

exports.scheduleMaintenance = async (user, id, data) => {
  assertFleetManager(user);
  return runTransaction(async (client) => {
    await findAccessible(user, id, client, true);
    const maintenanceId = await vehicleModel.createMaintenance(client, id, {
      ...data,
      createdBy: user.id,
    });
    await auditModel.record({
      actorUserId: user.id,
      action: "VEHICLE_MAINTENANCE_SCHEDULED",
      resourceType: "VEHICLE_MAINTENANCE",
      resourceId: maintenanceId,
      metadata: { vehicleId: id, scheduledFor: data.scheduledFor },
    }, client);
    return vehicleModel.findMaintenanceById(id, maintenanceId, client);
  });
};

exports.updateMaintenanceStatus = async (user, id, maintenanceId, status) => {
  assertFleetManager(user);
  return runTransaction(async (client) => {
    await findAccessible(user, id, client, true);
    const maintenance = await vehicleModel.findMaintenanceById(id, maintenanceId, client, true);
    if (!maintenance) throw new AppError(404, "Maintenance record not found.", "NOT_FOUND");
    if (maintenance.status !== "SCHEDULED") {
      throw new AppError(409, "Only scheduled maintenance can be completed or cancelled.", "CONFLICT");
    }
    const updated = await vehicleModel.transitionMaintenance(client, id, maintenanceId, status);
    await auditModel.record({
      actorUserId: user.id,
      action: `VEHICLE_MAINTENANCE_${status}`,
      resourceType: "VEHICLE_MAINTENANCE",
      resourceId: maintenanceId,
      metadata: { vehicleId: id, previousStatus: maintenance.status, status },
    }, client);
    return updated;
  });
};
