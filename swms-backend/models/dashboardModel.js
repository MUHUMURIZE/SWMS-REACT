const { pool } = require("../config/db");

exports.admin = async () => {
  const result = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM companies) AS "totalCompanies",
      (SELECT COUNT(*)::int FROM representatives) AS "totalRepresentatives",
      (SELECT COUNT(*)::int FROM collectors) AS "totalCollectors",
      (SELECT COUNT(*)::int FROM households) AS "totalHouseholds",
      (SELECT COUNT(*)::int FROM collections) AS "totalCollections",
      (SELECT COUNT(*)::int FROM collections WHERE status IN ('collected', 'completed')) AS "completedCollections",
      (SELECT COUNT(*)::int FROM collections WHERE status IN ('pending', 'scheduled')) AS "pendingCollections"`
  );
  return result.rows[0];
};

exports.company = async (companyId) => {
  const result = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM collectors c JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = $1) AS "totalCollectors",
      (SELECT COUNT(*)::int FROM households h JOIN collectors c ON c.id = h.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = $1) AS "totalHouseholds",
      (SELECT COUNT(*)::int FROM collections cl JOIN collectors c ON c.id = cl.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = $1) AS "totalCollections",
      (SELECT COUNT(*)::int FROM collections cl JOIN collectors c ON c.id = cl.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = $1 AND cl.status IN ('collected', 'completed')) AS "completedCollections",
      (SELECT COUNT(*)::int FROM collections cl JOIN collectors c ON c.id = cl.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = $1 AND cl.status IN ('pending', 'scheduled')) AS "pendingCollections"`,
    [companyId]
  );
  const metrics = result.rows[0];
  metrics.completionRate = metrics.totalCollections
    ? Number(((metrics.completedCollections / metrics.totalCollections) * 100).toFixed(2))
    : 0;
  return metrics;
};

exports.collector = async (collectorId) => {
  const result = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM households WHERE collector_id = $1) AS "myHouseholds",
      (SELECT COUNT(*)::int FROM collections WHERE collector_id = $1 AND status IN ('pending', 'scheduled')) AS "pendingCollections",
      (SELECT COUNT(*)::int FROM collections WHERE collector_id = $1 AND status IN ('collected', 'completed')) AS "completedCollections"`,
    [collectorId]
  );
  return result.rows[0];
};
