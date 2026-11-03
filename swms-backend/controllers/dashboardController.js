const { pool } = require("../config/db");
const dashboardModel = require("../models/dashboardModel");
const collectionModel = require("../models/collectionModel");
const binModel = require("../models/binModel");
const binService = require("../services/binService");
const AppError = require("../utils/AppError");

async function profileId(table, userId) {
  const result = await pool.query(`SELECT id FROM ${table} WHERE user_id = $1`, [userId]);
  return result.rows[0]?.id ?? null;
}

exports.admin = async (_req, res) => {
  const [dashboard, bins] = await Promise.all([
    dashboardModel.admin(),
    binService.statistics("ADMIN"),
  ]);
  res.json({ data: { ...dashboard, ...bins } });
};

exports.company = async (req, res) => {
  const result = await pool.query("SELECT company_id FROM representatives WHERE user_id = $1", [req.user.id]);
  if (!result.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
  const [dashboard, bins] = await Promise.all([
    dashboardModel.company(result.rows[0].company_id),
    binService.statistics(req.user.role, req.user.id),
  ]);
  res.json({ data: { ...dashboard, ...bins } });
};

exports.collector = async (req, res) => {
  const id = await profileId("collectors", req.user.id);
  if (!id) throw new AppError(404, "Collector profile not found.", "NOT_FOUND");
  const [dashboard, bins] = await Promise.all([
    dashboardModel.collector(id),
    binService.statistics(req.user.role, req.user.id),
  ]);
  res.json({
    data: {
      ...dashboard,
      assignedBins: bins.totalBins,
      fullBinsRequiringPickup: bins.binsRequiringPickup,
    },
  });
};

exports.household = async (req, res) => {
  const id = await profileId("households", req.user.id);
  if (!id) throw new AppError(404, "Household profile not found.", "NOT_FOUND");
  const bin = await binModel.findByHouseholdId(id);
  res.json({
    data: {
      nextCollection: await collectionModel.getNextForHousehold(id),
      currentCollection: await collectionModel.getCurrentForHousehold(id),
      history: await collectionModel.getHouseholdHistory(id),
      bin: bin ? {
        binCode: bin.binCode,
        capacity: bin.capacity,
        fillLevel: bin.fillLevel,
        status: bin.status,
      } : null,
    },
  });
};
