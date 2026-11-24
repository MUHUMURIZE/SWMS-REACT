const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const representativeModel = require("../models/representativeModel");
const userModel = require("../models/userModel");
const companyModel = require("../models/companyModel");
const { createAccount } = require("../services/accountService");
const AppError = require("../utils/AppError");
const auditModel = require("../models/auditModel");

exports.list = async (req, res) => res.json({ data: await representativeModel.list(req.pagination) });

exports.get = async (req, res) => {
  const representative = await representativeModel.findById(req.params.id);
  if (!representative) throw new AppError(404, "Company representative not found.", "NOT_FOUND");
  res.json({ data: representative });
};

exports.create = async (req, res) => {
  const { fullName, email, password, phone, companyId, district, sector, cell, village } = req.body;
  const created = await createAccount({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    role: "COMPANY_REPRESENTATIVE",
    phone,
    companyId,
    district,
    sector,
    cell,
    village,
  });
  res.status(201).json({ data: await representativeModel.findById(created.resourceId) });
};

exports.update = async (req, res) => {
  if (req.body.companyId !== undefined) {
    if (!(await companyModel.findById(req.body.companyId))) {
      throw new AppError(404, "Company not found.", "NOT_FOUND");
    }
  }
  const representative = await representativeModel.update(req.params.id, req.body);
  if (!representative) throw new AppError(404, "Company representative not found.", "NOT_FOUND");
  res.json({ data: representative });
};

exports.remove = async (req, res) => {
  const representative = await representativeModel.findById(req.params.id);
  if (!representative) throw new AppError(404, "Company representative not found.", "NOT_FOUND");
  const dependencies = await pool.query(
    "SELECT 1 FROM collectors WHERE representative_id = $1 LIMIT 1",
    [req.params.id]
  );
  if (dependencies.rows[0]) {
    throw new AppError(409, "A representative with collectors cannot be deleted.", "CONFLICT");
  }
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const collectorResult = await connection.query(
      "SELECT id, user_id FROM collectors WHERE representative_id = $1",
      [req.params.id]
    );
    for (const collector of collectorResult.rows) {
      const householdResult = await connection.query(
        "SELECT user_id FROM households WHERE collector_id = $1",
        [collector.id]
      );
      for (const household of householdResult.rows) {
        await connection.query("DELETE FROM users WHERE id = $1", [household.user_id]);
      }
      await connection.query("DELETE FROM users WHERE id = $1", [collector.user_id]);
    }
    await connection.query("DELETE FROM users WHERE id = $1", [representative.userId]);
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
  await auditModel.record({
    actorUserId: req.user.id,
    action: "REPRESENTATIVE_DELETED",
    resourceType: "REPRESENTATIVE",
    resourceId: req.params.id,
    ipAddress: req.ip,
  });
  res.status(204).end();
};
