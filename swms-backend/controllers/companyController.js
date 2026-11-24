const companyModel = require("../models/companyModel");
const AppError = require("../utils/AppError");
const auditModel = require("../models/auditModel");

exports.list = async (_req, res) => {
  res.json({ data: await companyModel.list(_req.pagination) });
};

exports.get = async (req, res) => {
  const company = await companyModel.findById(req.params.id);
  if (!company) throw new AppError(404, "Company not found.", "NOT_FOUND");
  res.json({ data: company });
};

exports.create = async (req, res) => {
  const company = await companyModel.create(req.body.name.trim(), req.body);
  res.status(201).json({ data: company });
};

exports.update = async (req, res) => {
  const company = await companyModel.update(req.params.id, req.body.name.trim(), req.body);
  if (!company) throw new AppError(404, "Company not found.", "NOT_FOUND");
  res.json({ data: company });
};

exports.remove = async (req, res) => {
  try {
    const removed = await companyModel.remove(req.params.id);
    if (!removed) throw new AppError(404, "Company not found.", "NOT_FOUND");
    res.status(204).end();
  } catch (error) {
    if (error.code === "23503") {
      throw new AppError(409, "A company with representatives cannot be deleted.", "CONFLICT");
    }
    throw error;
  }
};
