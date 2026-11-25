const { pool } = require("../config/db");

exports.admin = async () => {
  const result = await pool.query(
    `WITH company_stats AS (
       SELECT co.name,
         COUNT(cl.id) FILTER (WHERE cl.status IN ('collected','completed'))::int AS completed,
         COUNT(cl.id)::int AS total
       FROM companies co
       LEFT JOIN representatives r ON r.company_id = co.id
       LEFT JOIN collectors c ON c.representative_id = r.id
       LEFT JOIN collections cl ON cl.collector_id = c.id
       GROUP BY co.id, co.name
     )
     SELECT
      (SELECT COUNT(*)::int FROM companies) AS "totalCompanies",
      (SELECT COUNT(*)::int FROM districts) AS "totalDistricts",
      (SELECT COUNT(*)::int FROM districts WHERE assignment_status = 'ASSIGNED') AS "assignedDistricts",
      (SELECT COUNT(*)::int FROM districts WHERE assignment_status = 'UNASSIGNED') AS "unassignedDistricts",
      (SELECT COUNT(*)::int FROM company_district_agreements WHERE status = 'ACTIVE') AS "activeAgreements",
      (SELECT COUNT(*)::int FROM company_district_agreements WHERE status = 'EXPIRED') AS "expiredAgreements",
      (SELECT COUNT(*)::int FROM company_district_agreements WHERE status = 'SUSPENDED') AS "suspendedAgreements",
      (SELECT COUNT(*)::int FROM representatives) AS "totalRepresentatives",
      (SELECT COUNT(*)::int FROM collectors) AS "totalCollectors",
      (SELECT COUNT(*)::int FROM households) AS "totalHouseholds",
      (SELECT COUNT(*)::int FROM collections) AS "totalCollections",
      (SELECT COUNT(*)::int FROM collections WHERE status IN ('collected', 'completed')) AS "completedCollections",
      (SELECT COUNT(*)::int FROM collections WHERE status IN ('pending', 'scheduled')) AS "pendingCollections",
      (SELECT COUNT(*)::int FROM collections WHERE status = 'in_progress') AS "inProgressCollections",
      (SELECT COUNT(*)::int FROM collections WHERE status = 'missed') AS "missedCollections",
      (SELECT COUNT(*)::int FROM collections
        WHERE status IN ('pending', 'scheduled')
          AND scheduled_at < CURRENT_TIMESTAMP) AS "overdueCollections",
      (SELECT COUNT(*)::int FROM waste_bins WHERE status = 'EMPTY') AS "emptyBins",
      (SELECT COUNT(*)::int FROM waste_bins WHERE status = 'LOW') AS "lowBins",
      (SELECT COUNT(*)::int FROM waste_bins WHERE status = 'MEDIUM') AS "mediumBins",
      (SELECT COUNT(*)::int FROM waste_bins WHERE status = 'HIGH') AS "highBins",
      (SELECT COUNT(*)::int FROM waste_bins WHERE status = 'FULL') AS "fullBins",
      (SELECT json_agg(district_row) FROM (
         SELECT h.district, COUNT(*)::int AS "count"
         FROM households h
         WHERE h.district IS NOT NULL
         GROUP BY h.district
         ORDER BY count DESC LIMIT 10
       ) district_row) AS "topDistricts",
      (SELECT json_agg(company_row) FROM (
         SELECT name AS "company",
           completed,
           total,
           CASE WHEN total > 0 THEN ROUND(completed::numeric / total * 100, 2) ELSE 0 END AS "completionRate"
         FROM company_stats
         ORDER BY completed DESC LIMIT 10
       ) company_row) AS "topCompanies",
      CASE WHEN (SELECT COUNT(*) FROM collections) = 0 THEN 0
        ELSE ROUND(
          (SELECT COUNT(*) FROM collections WHERE status IN ('collected','completed'))::numeric
          / (SELECT COUNT(*) FROM collections) * 100,
          2
        ) END AS "collectionCompletionRate"`
  );
  return result.rows[0];
};

exports.company = async (companyId) => {
  const result = await pool.query(
    `WITH authorized_collectors AS (
       SELECT c.id, c.user_id
       FROM collectors c
       JOIN representatives r ON r.id = c.representative_id
       WHERE r.company_id = $1 AND company_has_active_district(r.company_id, c.district)
     ),
     authorized_households AS (
       SELECT h.id, h.collector_id
       FROM households h
       JOIN authorized_collectors c ON c.id = h.collector_id
       JOIN collectors actual_collector ON actual_collector.id = h.collector_id
       WHERE company_has_active_district($1, h.district)
         AND LOWER(BTRIM(actual_collector.district)) = LOWER(BTRIM(h.district))
     ),
     authorized_collections AS (
       SELECT cl.id, cl.collector_id, cl.household_id, cl.status, cl.scheduled_at
       FROM collections cl
       JOIN authorized_households h ON h.id = cl.household_id
       WHERE cl.collector_id = h.collector_id
     )
     SELECT
      (SELECT COUNT(*)::int FROM authorized_collectors) AS "totalCollectors",
      (SELECT COUNT(*)::int FROM authorized_households) AS "totalHouseholds",
      (SELECT COUNT(*)::int FROM authorized_collections) AS "totalCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status IN ('collected', 'completed')) AS "completedCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status IN ('pending', 'scheduled')) AS "pendingCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status = 'in_progress') AS "inProgressCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status = 'missed') AS "missedCollections",
      (SELECT COUNT(*)::int FROM authorized_collections
        WHERE status IN ('pending', 'scheduled') AND scheduled_at < CURRENT_TIMESTAMP) AS "overdueCollections",
      (SELECT COUNT(*)::int FROM waste_bins b
        JOIN authorized_households h ON h.id = b.household_id
        WHERE b.status IN ('HIGH','FULL')) AS "fullBinMetrics",
      (SELECT json_agg(collector_row) FROM (
         SELECT cu.full_name AS "collector",
           COUNT(DISTINCT h.id)::int AS "households",
           COUNT(DISTINCT cl.id) FILTER (WHERE cl.status IN ('collected','completed'))::int AS "completedCollections",
           COUNT(DISTINCT cl.id)::int AS "totalCollections"
         FROM authorized_collectors c
         JOIN users cu ON cu.id = c.user_id
         LEFT JOIN authorized_households h ON h.collector_id = c.id
         LEFT JOIN authorized_collections cl ON cl.collector_id = c.id
         GROUP BY c.id, cu.full_name
         ORDER BY "completedCollections" DESC
       ) collector_row) AS "collectorPerformance",
      (SELECT district FROM companies WHERE id = $1) AS district,
      (SELECT sector FROM companies WHERE id = $1) AS sector,
      (SELECT cell FROM companies WHERE id = $1) AS cell,
      (SELECT village FROM companies WHERE id = $1) AS village`,
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
    `WITH authorized_households AS (
       SELECT h.id FROM households h
       JOIN collectors c ON c.id = h.collector_id
       JOIN representatives r ON r.id = c.representative_id
       WHERE h.collector_id = $1
         AND company_has_active_district(r.company_id, h.district)
         AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district))
     ),
     authorized_collections AS (
       SELECT cl.* FROM collections cl
       JOIN authorized_households h ON h.id = cl.household_id
       WHERE cl.collector_id = $1
     )
     SELECT
      (SELECT COUNT(*)::int FROM authorized_households) AS "myHouseholds",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status IN ('pending', 'scheduled')) AS "pendingCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status IN ('collected', 'completed')) AS "completedCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status = 'in_progress') AS "inProgressCollections",
      (SELECT COUNT(*)::int FROM authorized_collections WHERE status = 'missed') AS "missedCollections",
      (SELECT COUNT(*)::int FROM authorized_collections
        WHERE status IN ('pending', 'scheduled') AND scheduled_at < CURRENT_TIMESTAMP) AS "overdueCollections",
      (SELECT COUNT(*)::int FROM waste_bins b
        JOIN authorized_households h ON h.id = b.household_id
        WHERE b.status IN ('HIGH','FULL')) AS "binsRequiringImmediatePickup",
      (SELECT COUNT(*)::int FROM authorized_collections
        WHERE scheduled_at >= date_trunc('day', CURRENT_TIMESTAMP)
          AND scheduled_at < date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day') AS "todayCollections",
      (SELECT district FROM collectors WHERE id = $1) AS district,
      (SELECT sector FROM collectors WHERE id = $1) AS sector,
      (SELECT cell FROM collectors WHERE id = $1) AS cell,
      (SELECT village FROM collectors WHERE id = $1) AS village`,
    [collectorId]
  );
  return result.rows[0];
};

exports.household = async (householdId) => {
  const result = await pool.query(
    `SELECT h.district, h.sector, h.cell, h.village,
      (SELECT COUNT(*)::int FROM collections WHERE household_id = h.id) AS "totalCollections",
      (SELECT COUNT(*)::int FROM collections
        WHERE household_id = h.id AND status IN ('collected', 'completed')) AS "completedCollections",
      (SELECT COUNT(*)::int FROM collections
        WHERE household_id = h.id AND status IN ('pending', 'scheduled')) AS "pendingCollections",
      (SELECT COUNT(*)::int FROM collections
        WHERE household_id = h.id AND status = 'in_progress') AS "inProgressCollections",
      (SELECT COUNT(*)::int FROM collections
         WHERE household_id = h.id AND status = 'missed') AS "missedCollections",
       (SELECT COALESCE(json_agg(trend_row ORDER BY recorded_at), '[]'::json)
        FROM (
          SELECT fh.fill_level AS "fillLevel", fh.status, fh.recorded_at AS "recordedAt"
          FROM bin_fill_history fh
          JOIN waste_bins b ON b.id = fh.bin_id
          WHERE b.household_id = h.id
          ORDER BY fh.recorded_at DESC
          LIMIT 30
        ) trend_row) AS "binFillTrend"
     FROM households h WHERE h.id = $1`,
    [householdId]
  );
  return result.rows[0] || null;
};
