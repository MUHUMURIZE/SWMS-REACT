const reportModel = require("../models/reportModel");
const AppError = require("../utils/AppError");
const { pool } = require("../config/db");

function positiveQueryId(value, name) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new AppError(400, `${name} must be a positive integer.`, "VALIDATION_ERROR");
  }
  return Number(value);
}

function optionalLocation(value, name) {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.trim().length > 160) {
    throw new AppError(400, `${name} must be a string of at most 160 characters.`, "VALIDATION_ERROR");
  }
  return value.trim() || null;
}

exports.district = async (req, res) => {
  res.json({ data: await reportModel.district(optionalLocation(req.query.district, "district")) });
};

exports.sector = async (req, res) => {
  res.json({ data: await reportModel.sector(optionalLocation(req.query.sector, "sector")) });
};

exports.collector = async (req, res) => {
  let collectorId = req.query.collectorId === undefined
    ? null
    : positiveQueryId(req.query.collectorId, "collectorId");
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    const collector = collectorId
      ? await pool.query(
        `SELECT c.id FROM collectors c
         JOIN representatives r ON r.id = c.representative_id
         WHERE c.id = $1 AND r.user_id = $2`,
        [collectorId, req.user.id]
      )
      : { rows: [] };
    if (!collector.rows[0]) throw new AppError(404, "Collector not found.", "NOT_FOUND");
  }
  if (collectorId === null) throw new AppError(400, "collectorId is required.", "VALIDATION_ERROR");
  res.json({ data: await reportModel.collector(collectorId) });
};

exports.company = async (req, res) => {
  let companyId = req.query.companyId === undefined
    ? null
    : positiveQueryId(req.query.companyId, "companyId");
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await pool.query(
      "SELECT company_id FROM representatives WHERE user_id = $1",
      [req.user.id]
    );
    if (!representative.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
    companyId = representative.rows[0].company_id;
  }
  if (companyId === null) throw new AppError(400, "companyId is required.", "VALIDATION_ERROR");
  res.json({ data: await reportModel.company(companyId) });
};
