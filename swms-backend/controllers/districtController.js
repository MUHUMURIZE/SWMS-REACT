const districtModel = require("../models/districtModel");
const districtAgreementService = require("../services/districtAgreementService");
const AppError = require("../utils/AppError");

exports.list = async (req, res) => {
  res.json({ data: await districtModel.list(req.pagination) });
};

exports.get = async (req, res) => {
  const district = await districtModel.findById(req.params.id);
  if (!district) throw new AppError(404, "District not found.", "NOT_FOUND");
  res.json({ data: district });
};

exports.create = async (req, res) => {
  const district = await districtAgreementService.createDistrict(req.body.name, req.user.id);
  res.status(201).json({ data: district });
};

exports.listAgreements = async (req, res) => {
  const districtId = req.params.id === undefined ? undefined : req.params.id;
  if (districtId !== undefined && !(await districtModel.findById(districtId))) {
    throw new AppError(404, "District not found.", "NOT_FOUND");
  }
  res.json({
    data: await districtModel.listAgreements({ districtId, pagination: req.pagination }),
  });
};

exports.createAgreement = async (req, res) => {
  const agreement = await districtAgreementService.createAgreement(
    req.params.id,
    req.body,
    req.user.id
  );
  res.status(201).json({ data: agreement });
};

exports.transitionAgreement = async (req, res) => {
  const agreement = await districtAgreementService.transitionAgreement(
    req.params.id,
    req.body.status,
    req.body.reason,
    req.user.id,
    req.ip
  );
  res.json({ data: agreement });
};
