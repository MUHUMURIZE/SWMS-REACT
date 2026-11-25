const { pool } = require("../config/db");

exports.list = async (pagination = { limit: 50, offset: 0 }) => {
  const result = await pool.query(
    `SELECT d.id, d.name, d.assignment_status AS "assignmentStatus",
      d.created_at AS "createdAt", d.updated_at AS "updatedAt",
      COUNT(a.id)::int AS "agreementCount",
      COUNT(a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS "activeAgreementCount"
     FROM districts d
     LEFT JOIN company_district_agreements a ON a.district_id = d.id
     GROUP BY d.id
     ORDER BY d.name, d.id
     LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.findById = async (id, executor = pool) => {
  const result = await executor.query(
    `SELECT d.id, d.name, d.assignment_status AS "assignmentStatus",
      d.created_at AS "createdAt", d.updated_at AS "updatedAt",
      COUNT(a.id)::int AS "agreementCount",
      COUNT(a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS "activeAgreementCount"
     FROM districts d
     LEFT JOIN company_district_agreements a ON a.district_id = d.id
     WHERE d.id = $1
     GROUP BY d.id`,
    [id]
  );
  return result.rows[0] || null;
};

exports.create = async (name, executor = pool) => {
  const result = await executor.query(
    "INSERT INTO districts (name) VALUES ($1) RETURNING id",
    [name]
  );
  return exports.findById(result.rows[0].id, executor);
};

exports.listAgreements = async ({ districtId, pagination = { limit: 50, offset: 0 } }) => {
  const values = [];
  const where = districtId === undefined ? "" : "WHERE a.district_id = $1";
  if (districtId !== undefined) values.push(districtId);
  values.push(pagination.limit, pagination.offset);
  const limitPosition = values.length - 1;
  const offsetPosition = values.length;
  const result = await pool.query(
    `SELECT a.id, a.district_id AS "districtId", d.name AS "districtName",
      a.company_id AS "companyId", c.name AS "companyName", a.status,
      a.starts_on::text AS "startsOn", a.ends_on::text AS "endsOn",
      a.activated_at AS "activatedAt", a.ended_at AS "endedAt",
      a.created_at AS "createdAt"
     FROM company_district_agreements a
     JOIN districts d ON d.id = a.district_id
     JOIN companies c ON c.id = a.company_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
    values
  );
  return result.rows;
};
