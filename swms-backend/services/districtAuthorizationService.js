const { pool } = require("../config/db");

exports.companyCanOperateInDistrict = async (companyId, district, executor = pool) => {
  if (!companyId || typeof district !== "string" || !district.trim()) return false;
  const result = await executor.query(
    "SELECT company_has_active_district($1, $2) AS authorized",
    [companyId, district]
  );
  return result.rows[0]?.authorized === true;
};
