const reportModel = require("../models/reportModel");
const AppError = require("../utils/AppError");
const { pool } = require("../config/db");

exports.district = async (req, res) => {
  res.json({ data: await reportModel.district(req.query.district || null) });
};

exports.sector = async (req, res) => {
  res.json({ data: await reportModel.sector(req.query.sector || null) });
};

exports.collector = async (req, res) => {
  let collectorId = req.query.collectorId ? Number(req.query.collectorId) : null;
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
  if (!collectorId) throw new AppError(400, "collectorId is required.", "VALIDATION_ERROR");
  res.json({ data: await reportModel.collector(collectorId) });
};

exports.company = async (req, res) => {
  let companyId = req.query.companyId ? Number(req.query.companyId) : null;
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    const representative = await pool.query(
      "SELECT company_id FROM representatives WHERE user_id = $1",
      [req.user.id]
    );
    if (!representative.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
    companyId = representative.rows[0].company_id;
  }
  if (!companyId) throw new AppError(400, "companyId is required.", "VALIDATION_ERROR");
  res.json({ data: await reportModel.company(companyId) });
};
