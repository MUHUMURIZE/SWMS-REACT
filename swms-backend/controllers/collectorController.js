const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const collectorModel = require("../models/collectorModel");
const representativeModel = require("../models/representativeModel");
const { createAccount } = require("../services/accountService");
const districtAuthorizationService = require("../services/districtAuthorizationService");
const AppError = require("../utils/AppError");
const auditModel = require("../models/auditModel");

exports.list = async (req, res) => {
  let companyId = null;
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await representativeModel.findByUserId(req.user.id);
    if (!representative) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
    companyId = representative.companyId;
  }
  res.json({ data: await collectorModel.list(companyId, req.pagination) });
};

exports.get = async (req, res) => {
  const collector = await collectorModel.findById(req.params.id);
  if (!collector) throw new AppError(404, "Collector not found.", "NOT_FOUND");
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await representativeModel.findByUserId(req.user.id);
    if (!representative || collector.companyId !== representative.companyId
      || !(await districtAuthorizationService.companyCanOperateInDistrict(
        representative.companyId,
        collector.district
      ))) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }
  }
  res.json({ data: collector });
};

exports.create = async (req, res) => {
  const { fullName, email, password, phone, district, sector, cell, village } = req.body;
  let representativeId = req.body.representativeId;
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    if (req.body.representativeId !== undefined) {
      throw new AppError(403, "Company representatives cannot reassign collectors.");
    }
    const result = await pool.query(
      "SELECT id, company_id FROM representatives WHERE user_id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
    if (!(await districtAuthorizationService.companyCanOperateInDistrict(
      result.rows[0].company_id,
      district
    ))) {
      throw new AppError(403, "The company has no active agreement for the collector's district.", "FORBIDDEN");
    }
    representativeId = result.rows[0].id;
  }
  const created = await createAccount({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    role: "COLLECTOR",
    phone,
    representativeId,
    district,
    sector,
    cell,
    village,
  });
  res.status(201).json({ data: await collectorModel.findById(created.resourceId) });
};

exports.update = async (req, res) => {
  const collector = await collectorModel.findById(req.params.id);
  if (!collector) throw new AppError(404, "Collector not found.", "NOT_FOUND");
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    if (req.body.representativeId !== undefined) {
      throw new AppError(403, "Company representatives cannot reassign collectors.");
    }
    const representative = await representativeModel.findByUserId(req.user.id);
    if (!representative || collector.companyId !== representative.companyId
      || !(await districtAuthorizationService.companyCanOperateInDistrict(
        representative.companyId,
        collector.district
      ))) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }
    if (req.body.district !== undefined
      && !(await districtAuthorizationService.companyCanOperateInDistrict(
        representative.companyId,
        req.body.district
      ))) {
      throw new AppError(403, "The company has no active agreement for the collector's district.", "FORBIDDEN");
    }
  }
  if (req.user.role === "ADMIN" && req.body.representativeId !== undefined
    && !(await representativeModel.findById(req.body.representativeId))) {
    throw new AppError(404, "Company representative not found.", "NOT_FOUND");
  }
  if (req.body.district !== undefined) {
    const assignedHouseholds = await pool.query(
      `SELECT 1 FROM households
       WHERE collector_id = $1
         AND LOWER(BTRIM(district)) IS DISTINCT FROM LOWER(BTRIM($2))
       LIMIT 1`,
      [collector.id, req.body.district]
    );
    if (assignedHouseholds.rows[0]) {
      throw new AppError(
        409,
        "The collector's district cannot change while assigned households remain in another district.",
        "CONFLICT"
      );
    }
  }
  const updated = await collectorModel.update(req.params.id, req.user.role === "ADMIN"
    ? req.body
    : {
      fullName: req.body.fullName,
      phone: req.body.phone,
      district: req.body.district,
      sector: req.body.sector,
      cell: req.body.cell,
      village: req.body.village,
    });
  res.json({ data: updated });
};

exports.remove = async (req, res) => {
  const collector = await collectorModel.findById(req.params.id);
  if (!collector) throw new AppError(404, "Collector not found.", "NOT_FOUND");
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await representativeModel.findByUserId(req.user.id);
    if (!representative || collector.companyId !== representative.companyId
      || !(await districtAuthorizationService.companyCanOperateInDistrict(
        representative.companyId,
        collector.district
      ))) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }
  }
  const vehicleAssignment = await pool.query(
    "SELECT 1 FROM fleet_vehicles WHERE assigned_collector_id = $1 LIMIT 1",
    [req.params.id]
  );
  if (vehicleAssignment.rows[0]) {
    throw new AppError(409, "Unassign the collector's vehicle before deleting the collector.", "CONFLICT");
  }
  const dependencies = await pool.query(
    "SELECT 1 FROM households WHERE collector_id = $1 LIMIT 1",
    [req.params.id]
  );
  if (dependencies.rows[0]) {
    throw new AppError(409, "A collector with assigned households cannot be deleted.", "CONFLICT");
  }
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const households = await connection.query(
      "SELECT user_id FROM households WHERE collector_id = $1",
      [req.params.id]
    );
    for (const household of households.rows) {
      await connection.query("DELETE FROM users WHERE id = $1", [household.user_id]);
    }
    await connection.query("DELETE FROM users WHERE id = $1", [collector.userId]);
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  await auditModel.record({
    actorUserId: req.user.id,
    action: "COLLECTOR_DELETED",
    resourceType: "COLLECTOR",
    resourceId: req.params.id,
    ipAddress: req.ip,
  });
  res.status(204).end();
};
