const { pool } = require("../config/db");

const metricQuery = (where, join = "") => `
  SELECT
    COUNT(DISTINCT h.id)::int AS "totalHouseholds",
    COUNT(DISTINCT b.id)::int AS "totalBins",
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'EMPTY')::int AS "emptyBins",
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'LOW')::int AS "lowBins",
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'MEDIUM')::int AS "mediumBins",
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'HIGH')::int AS "highBins",
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'FULL')::int AS "fullBins",
    COUNT(DISTINCT cl.id) FILTER (WHERE cl.status IN ('collected','completed'))::int AS "collectionsCompleted",
    COUNT(DISTINCT cl.id) FILTER (WHERE cl.status IN ('pending','scheduled'))::int AS "collectionsPending",
    COUNT(DISTINCT cl.id) FILTER (WHERE cl.status = 'in_progress')::int AS "collectionsInProgress"
  FROM households h
  JOIN collectors c ON c.id = h.collector_id
  JOIN representatives r ON r.id = c.representative_id
  LEFT JOIN waste_bins b ON b.household_id = h.id
  LEFT JOIN collections cl ON cl.household_id = h.id
  ${join}
  ${where}
`;

exports.district = async (district) => {
  const result = await pool.query(
    metricQuery(district ? "WHERE h.district = $1" : "", ""),
    district ? [district] : []
  );
  return result.rows[0];
};

exports.sector = async (sector) => {
  const result = await pool.query(
    metricQuery(sector ? "WHERE h.sector = $1" : "", ""),
    sector ? [sector] : []
  );
  return result.rows[0];
};

exports.collector = async (collectorId) => {
  const result = await pool.query(
    metricQuery("WHERE c.id = $1", ""),
    [collectorId]
  );
  return result.rows[0];
};

exports.company = async (companyId) => {
  const result = await pool.query(
    metricQuery("WHERE r.company_id = $1", ""),
    [companyId]
  );
  return result.rows[0];
};
