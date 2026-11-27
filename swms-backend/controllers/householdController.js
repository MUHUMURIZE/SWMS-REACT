const bcrypt = require("bcrypt");
const householdModel = require("../models/householdModel");
const userModel = require("../models/userModel");
const householdService = require("../services/householdService");
const AppError = require("../utils/AppError");
const auditModel = require("../models/auditModel");
const { validateGeoInput } = require("../utils/geo");

exports.list = async (req, res) => {
  const households = await householdService.list(req.user, req.pagination);
  res.json({ data: households });
};

exports.get = async (req, res) => {
  const household = await householdService.get(req.user, req.params.id);
  res.json({ data: household });
};

exports.create = async (req, res) => {
  const data = {
    ...req.body,
    passwordHash: await bcrypt.hash(req.body.password, 12),
  };
  delete data.password;
  const created = await householdService.create(req.user, data);
  res.status(201).json({ data: await householdModel.findById(created.resourceId) });
};

exports.update = async (req, res) => {
  const updated = await householdService.update(req.user, req.params.id, req.body);
  res.json({ data: updated });
};

exports.remove = async (req, res) => {
  await householdService.remove(req.user, req.params.id);
  await auditModel.record({
    actorUserId: req.user.id,
    action: "HOUSEHOLD_DELETED",
    resourceType: "HOUSEHOLD",
    resourceId: req.params.id,
    ipAddress: req.ip,
  });
  res.status(204).end();
};

exports.me = async (req, res) => {
  const user = await userModel.findPublicById(req.user.id);
  const profile = await householdModel.findByUserId(req.user.id);
  if (!profile) throw new AppError(404, "Household profile not found.", "NOT_FOUND");
  res.json({ data: { user, profile } });
};

exports.updateMe = async (req, res) => {
  const profile = await householdModel.findByUserId(req.user.id);
  if (!profile) throw new AppError(404, "Household profile not found.", "NOT_FOUND");
  const geo = validateGeoInput(req.body);
  const updatedProfile = await householdModel.update(profile.id, geo ? { ...req.body, ...geo } : req.body);
  const user = await userModel.findPublicById(req.user.id);
  res.json({ data: { user, profile: updatedProfile } });
};
