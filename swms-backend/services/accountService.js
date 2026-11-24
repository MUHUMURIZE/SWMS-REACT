const { pool } = require("../config/db");
const runTransaction = require("../utils/transaction");
const AppError = require("../utils/AppError");
const userModel = require("../models/userModel");
const representativeModel = require("../models/representativeModel");
const collectorModel = require("../models/collectorModel");
const householdModel = require("../models/householdModel");
const binModel = require("../models/binModel");
const companyModel = require("../models/companyModel");

async function createAccount({
  fullName, email, passwordHash, role, phone, companyId, representativeId,
  collectorId, address, nationalId, district, sector, cell, village,
}) {
  return runTransaction(async (connection) => {
    if (role === "COMPANY_REPRESENTATIVE" && !(await companyModel.findById(companyId, connection))) {
      throw new AppError(404, "Company not found.", "NOT_FOUND");
    }
    if (role === "COMPANY_REPRESENTATIVE") {
      const representative = await connection.query(
        "SELECT id FROM representatives WHERE company_id = $1",
        [companyId]
      );
      if (representative.rows[0]) {
        throw new AppError(409, "This company already has a representative.", "CONFLICT");
      }
    }
    if (role === "COLLECTOR" && !(await representativeModel.findById(representativeId, connection))) {
      throw new AppError(404, "Company representative not found.", "NOT_FOUND");
    }
    if (role === "HOUSEHOLD" && !(await collectorModel.findById(collectorId, connection))) {
      throw new AppError(404, "Collector not found.", "NOT_FOUND");
    }

    const userId = await userModel.create(connection, { fullName, email, passwordHash, role, phone });
    let resourceId = userId;

    if (role === "COMPANY_REPRESENTATIVE") {
      resourceId = await representativeModel.create(connection, userId, companyId, {
        district, sector, cell, village,
      });
    } else if (role === "COLLECTOR") {
      resourceId = await collectorModel.create(connection, userId, representativeId, {
        district, sector, cell, village,
      });
    } else if (role === "HOUSEHOLD") {
      resourceId = await householdModel.create(connection, userId, collectorId, address, nationalId, {
        district, sector, cell, village,
      });
      await binModel.createForHousehold(connection, resourceId);
    }

    return { resourceId, userId };
  });
}

exports.createAccount = createAccount;
