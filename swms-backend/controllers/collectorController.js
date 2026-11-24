const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const collectorModel = require("../models/collectorModel");
const representativeModel = require("../models/representativeModel");
const { createAccount } = require("../services/accountService");
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
    if (!representative || collector.companyId !== representative.companyId) {
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
      "SELECT id FROM representatives WHERE user_id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
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
    if (!representative || collector.companyId !== representative.companyId) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }
  }
  if (req.user.role === "ADMIN" && req.body.representativeId !== undefined
    && !(await representativeModel.findById(req.body.representativeId))) {
    throw new AppError(404, "Company representative not found.", "NOT_FOUND");
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
    if (!representative || collector.companyId !== representative.companyId) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }
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
