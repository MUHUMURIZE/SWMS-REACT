const { pool } = require("../config/db");
const auditModel = require("../models/auditModel");
const notificationModel = require("../models/notificationModel");
const districtModel = require("../models/districtModel");
const AppError = require("../utils/AppError");
const transaction = require("../utils/transaction");

function createDistrictAgreementService(runTransaction = transaction) {
  const service = {};

  function conflictFrom(error) {
    if (error.code === "23505" || error.code === "23P01") {
      return new AppError(409, "The district has a conflicting pending or active agreement.", "CONFLICT");
    }
    if (error.code === "23514") {
      return new AppError(400, error.message, "BUSINESS_RULE_VIOLATION");
    }
    return error;
  }

  async function notifyAdministrators(executor, { title, message, agreementId }) {
    const administrators = await executor.query("SELECT id FROM users WHERE role = 'ADMIN'");
    for (const administrator of administrators.rows) {
      await notificationModel.createForUser(executor, administrator.id, {
        title,
        message,
        category: "DISTRICT_ASSIGNMENT",
        priority: "high",
        resourceType: "district_agreement",
        resourceId: agreementId,
      });
    }
  }

  service.createDistrict = async (name, actorUserId) => {
    try {
      return await runTransaction(async (client) => {
        const district = await districtModel.create(name, client);
        await auditModel.record({
          actorUserId,
          action: "district.created",
          resourceType: "district",
          resourceId: district.id,
        }, client);
        return district;
      });
    } catch (error) {
      if (error.code === "23505") {
        throw new AppError(409, "A district with that name already exists.", "CONFLICT");
      }
      throw error;
    }
  };

  service.createAgreement = async (districtId, { companyId, startsOn, endsOn }, actorUserId) => {
    try {
      return await runTransaction(async (client) => {
        const district = await districtModel.findById(districtId, client);
        if (!district) throw new AppError(404, "District not found.", "NOT_FOUND");
        const company = await client.query("SELECT id FROM companies WHERE id = $1", [companyId]);
        if (!company.rows[0]) throw new AppError(404, "Company not found.", "NOT_FOUND");
        const result = await client.query(
          `INSERT INTO company_district_agreements
            (district_id, company_id, starts_on, ends_on, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [districtId, companyId, startsOn, endsOn || null, actorUserId]
        );
        const agreement = await service.findAgreementById(result.rows[0].id, client);
        await auditModel.record({
          actorUserId,
          action: "district_agreement.created",
          resourceType: "district_agreement",
          resourceId: agreement.id,
          metadata: { districtId, companyId, startsOn, endsOn: endsOn || null, status: "PENDING" },
        }, client);
        return agreement;
      });
    } catch (error) {
      throw conflictFrom(error);
    }
  };

  service.findAgreementById = async (id, executor = pool) => {
    const result = await executor.query(
      `SELECT a.id, a.district_id AS "districtId", d.name AS "districtName",
        a.company_id AS "companyId", c.name AS "companyName", a.status,
        a.starts_on::text AS "startsOn", a.ends_on::text AS "endsOn",
        a.activated_at AS "activatedAt", a.ended_at AS "endedAt",
        a.created_at AS "createdAt"
       FROM company_district_agreements a
       JOIN districts d ON d.id = a.district_id
       JOIN companies c ON c.id = a.company_id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  };

  service.transitionAgreement = async (id, status, reason, actorUserId, ipAddress) => {
    try {
      return await runTransaction(async (client) => {
        const identity = await client.query(
          "SELECT district_id FROM company_district_agreements WHERE id = $1",
          [id]
        );
        if (!identity.rows[0]) throw new AppError(404, "District agreement not found.", "NOT_FOUND");
        await client.query("SELECT id FROM districts WHERE id = $1 FOR UPDATE", [identity.rows[0].district_id]);
        const current = await client.query(
          `SELECT a.id, a.district_id AS "districtId", d.name AS "districtName",
            a.company_id AS "companyId", c.name AS "companyName", a.status,
            a.starts_on::text AS "startsOn", a.ends_on::text AS "endsOn"
           FROM company_district_agreements a
           JOIN districts d ON d.id = a.district_id
           JOIN companies c ON c.id = a.company_id
           WHERE a.id = $1
           FOR UPDATE OF a`,
          [id]
        );
        const agreement = current.rows[0];
        if (!agreement) throw new AppError(404, "District agreement not found.", "NOT_FOUND");
        const validTransition = (agreement.status === "PENDING" && status === "ACTIVE")
          || (agreement.status === "ACTIVE" && ["SUSPENDED", "TERMINATED"].includes(status));
        if (!validTransition) {
          throw new AppError(409, `Cannot change agreement status from ${agreement.status} to ${status}.`, "CONFLICT");
        }

        const updated = await client.query(
          `UPDATE company_district_agreements
           SET status = $1::varchar,
             ended_by = CASE WHEN $1::varchar IN ('SUSPENDED', 'TERMINATED') THEN $2::integer ELSE ended_by END
           WHERE id = $3
           RETURNING id`,
          [status, actorUserId, id]
        );
        const result = await service.findAgreementById(updated.rows[0].id, client);
        await auditModel.record({
          actorUserId,
          action: `district_agreement.${status.toLowerCase()}`,
          resourceType: "district_agreement",
          resourceId: id,
          reason: reason || null,
          ipAddress,
          metadata: {
            districtId: agreement.districtId,
            districtName: agreement.districtName,
            companyId: agreement.companyId,
            companyName: agreement.companyName,
            previousStatus: agreement.status,
            status,
          },
        }, client);

        if (["SUSPENDED", "TERMINATED"].includes(status)) {
          await notifyAdministrators(client, {
            title: "District assignment ended",
            message: `${agreement.companyName}'s agreement for ${agreement.districtName} was ${status.toLowerCase()}. The district is now unassigned.`,
            agreementId: id,
          });
        }
        return result;
      });
    } catch (error) {
      throw conflictFrom(error);
    }
  };

  service.expireDueAgreements = async () => runTransaction(async (client) => {
    let expiredCount = 0;
    while (true) {
      const candidates = await client.query(
        `SELECT DISTINCT district_id
         FROM company_district_agreements
         WHERE status = 'ACTIVE' AND ends_on < CURRENT_DATE
         ORDER BY district_id
         LIMIT 100`
      );
      if (candidates.rows.length === 0) break;
      for (const { district_id: districtId } of candidates.rows) {
        await client.query("SELECT id FROM districts WHERE id = $1 FOR UPDATE", [districtId]);
        const due = await client.query(
          `SELECT a.id, a.company_id AS "companyId", c.name AS "companyName",
            d.name AS "districtName"
           FROM company_district_agreements a
           JOIN companies c ON c.id = a.company_id
           JOIN districts d ON d.id = a.district_id
           WHERE a.district_id = $1 AND a.status = 'ACTIVE' AND a.ends_on < CURRENT_DATE
           FOR UPDATE OF a`,
          [districtId]
        );
        for (const agreement of due.rows) {
          await client.query(
            "UPDATE company_district_agreements SET status = 'EXPIRED' WHERE id = $1",
            [agreement.id]
          );
          await auditModel.record({
            action: "district_agreement.expired",
            resourceType: "district_agreement",
            resourceId: agreement.id,
            metadata: {
              districtId,
              districtName: agreement.districtName,
              companyId: agreement.companyId,
              companyName: agreement.companyName,
            },
          }, client);
          await notifyAdministrators(client, {
            title: "District agreement expired",
            message: `${agreement.companyName}'s agreement for ${agreement.districtName} expired. The district is now unassigned.`,
            agreementId: agreement.id,
          });
          expiredCount += 1;
        }
      }
    }
    return expiredCount;
  });
  return service;
}

module.exports = Object.assign(createDistrictAgreementService(), { createDistrictAgreementService });
