const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const { pool } = require("../config/db");
const userModel = require("../models/userModel");
const householdModel = require("../models/householdModel");
const collectorModel = require("../models/collectorModel");
const representativeModel = require("../models/representativeModel");
const { createAccount } = require("../services/accountService");
const AppError = require("../utils/AppError");

exports.register = async (req, res) => {
  const {
    fullName, email, password, role, phone, companyId, representativeId,
    collectorId, address, nationalId, district, sector, cell, village,
  } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await createAccount({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role,
    phone,
    companyId,
    representativeId,
    collectorId,
    address,
    nationalId,
    district,
    sector,
    cell,
    village,
  });
  const user = await userModel.findPublicById(created.userId);
  res.status(201).json({ data: { id: created.resourceId, user } });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await userModel.findByEmail(email.trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, "Invalid email or password.", "UNAUTHENTICATED");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new AppError(500, "JWT_SECRET must be configured with at least 32 characters.", "CONFIGURATION_ERROR");
  }

  const tokenId = randomUUID();
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, tokenVersion: user.token_version, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const publicUser = await userModel.findPublicById(user.id);
  res.json({ data: { user: publicUser, accessToken, tokenType: "Bearer", expiresIn: 3600 } });
};

exports.logout = async (req, res) => {
  const expiresAt = new Date(req.user.tokenExpiresAt);
  await userModel.revokeToken(req.user.tokenId, req.user.id, expiresAt);
  res.json({ data: { message: "Logged out successfully." } });
};

exports.profile = async (req, res) => {
  const user = await userModel.findPublicById(req.user.id);
  if (!user) throw new AppError(404, "User not found.", "NOT_FOUND");
  let profile = null;
  if (req.user.role === "HOUSEHOLD") profile = await householdModel.findByUserId(req.user.id);
  if (req.user.role === "COLLECTOR") profile = await collectorModel.findByUserId(req.user.id);
  if (req.user.role === "COMPANY_REPRESENTATIVE") profile = await representativeModel.findByUserId(req.user.id);
  res.json({ data: { user, profile } });
};

exports.updateProfile = async (req, res) => {
  const user = await userModel.updateProfile(req.user.id, req.body);
  if (!user) throw new AppError(404, "User not found.", "NOT_FOUND");
  res.json({ data: { user } });
};

exports.changePassword = async (req, res) => {
  const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!result.rows[0]) throw new AppError(404, "User not found.", "NOT_FOUND");
  if (!(await bcrypt.compare(req.body.currentPassword, result.rows[0].password_hash))) {
    throw new AppError(400, "Current password is incorrect.", "INVALID_PASSWORD");
  }
  const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await userModel.updatePassword(req.user.id, passwordHash);
  res.json({ data: { message: "Password changed. Sign in again to get a new access token." } });
};
