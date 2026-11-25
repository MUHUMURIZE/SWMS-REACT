const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const AppError = require("../utils/AppError");
const { toCsv } = require("../utils/exportRows");
const auditModel = require("../models/auditModel");

const allowedResources = {
  companies: {
    columns: [
      { key: "id", label: "ID" }, { key: "name", label: "Name" },
      { key: "district", label: "District" }, { key: "sector", label: "Sector" },
      { key: "cell", label: "Cell" }, { key: "village", label: "Village" },
    ],
    query: "SELECT id, name, district, sector, cell, village FROM companies ORDER BY id",
  },
  collectors: {
    columns: [
      { key: "id", label: "ID" }, { key: "fullName", label: "Full Name" },
      { key: "email", label: "Email" }, { key: "companyId", label: "Company ID" },
      { key: "district", label: "District" }, { key: "sector", label: "Sector" },
    ],
    query: `SELECT c.id, u.full_name AS "fullName", u.email,
      r.company_id AS "companyId", c.district, c.sector
      FROM collectors c JOIN users u ON u.id = c.user_id
      JOIN representatives r ON r.id = c.representative_id ORDER BY c.id`,
  },
  households: {
    columns: [
      { key: "id", label: "ID" }, { key: "fullName", label: "Full Name" },
      { key: "email", label: "Email" }, { key: "collectorId", label: "Collector ID" },
      { key: "address", label: "Address" }, { key: "district", label: "District" },
    ],
    query: `SELECT h.id, u.full_name AS "fullName", u.email, h.collector_id AS "collectorId",
      h.address, h.district FROM households h JOIN users u ON u.id = h.user_id ORDER BY h.id`,
  },
  bins: {
    columns: [
      { key: "id", label: "ID" }, { key: "householdId", label: "Household ID" },
      { key: "binCode", label: "Bin Code" }, { key: "capacity", label: "Capacity" },
      { key: "fillLevel", label: "Fill Level" }, { key: "status", label: "Status" },
    ],
    query: `SELECT id, household_id AS "householdId", bin_code AS "binCode",
      capacity, fill_level AS "fillLevel", status FROM waste_bins ORDER BY id`,
  },
  collections: {
    columns: [
      { key: "id", label: "ID" }, { key: "householdId", label: "Household ID" },
      { key: "collectorId", label: "Collector ID" }, { key: "scheduledAt", label: "Scheduled At" },
      { key: "status", label: "Status" },
    ],
    query: `SELECT id, household_id AS "householdId", collector_id AS "collectorId",
      scheduled_at AS "scheduledAt", status FROM collections ORDER BY id`,
  },
};

async function getScopedRows(req, resource) {
  if (!Object.hasOwn(allowedResources, resource)) {
    throw new AppError(404, "Export resource not found.", "NOT_FOUND");
  }
  const definition = allowedResources[resource];
  if (req.user.role === "HOUSEHOLD") {
    throw new AppError(403, "Households cannot export system resources.");
  }
  if (req.user.role === "COLLECTOR" && !["households", "bins", "collections"].includes(resource)) {
    throw new AppError(403, "Collectors cannot export this resource.");
  }
  let query = definition.query;
  let values = [];
  if (req.user.role === "COLLECTOR") {
    if (resource === "households") {
      query = `SELECT h.id, u.full_name AS "fullName", u.email, h.collector_id AS "collectorId",
        h.address, h.district FROM households h JOIN users u ON u.id = h.user_id
        JOIN collectors c ON c.id = h.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE h.collector_id = (SELECT id FROM collectors WHERE user_id = $1)
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) ORDER BY h.id`;
      values = [req.user.id];
    } else if (resource === "bins") {
      query = `SELECT b.id, b.household_id AS "householdId", b.bin_code AS "binCode",
        b.capacity, b.fill_level AS "fillLevel", b.status FROM waste_bins b
        JOIN households h ON h.id = b.household_id
        JOIN collectors c ON c.id = h.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE h.collector_id = (SELECT id FROM collectors WHERE user_id = $1)
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) ORDER BY b.id`;
      values = [req.user.id];
    } else if (resource === "collections") {
      query = `SELECT cl.id, cl.household_id AS "householdId", cl.collector_id AS "collectorId",
        cl.scheduled_at AS "scheduledAt", cl.status FROM collections cl
        JOIN households h ON h.id = cl.household_id
        JOIN collectors c ON c.id = cl.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE cl.collector_id = (SELECT id FROM collectors WHERE user_id = $1)
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) ORDER BY cl.id`;
      values = [req.user.id];
    }
  }
  if (req.user.role === "COMPANY_REPRESENTATIVE"
    && ["companies", "collectors", "households", "bins", "collections"].includes(resource)) {
    const representative = await pool.query(
      "SELECT id, company_id FROM representatives WHERE user_id = $1",
      [req.user.id]
    );
    if (!representative.rows[0]) throw new AppError(404, "Representative profile not found.", "NOT_FOUND");
  }
  if (req.user.role === "COMPANY_REPRESENTATIVE") {
    if (resource === "collectors") {
      query = `SELECT c.id, u.full_name AS "fullName", u.email,
        r.company_id AS "companyId", c.district, c.sector
        FROM collectors c JOIN users u ON u.id = c.user_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = (SELECT company_id FROM representatives WHERE user_id = $1)
          AND company_has_active_district(r.company_id, c.district) ORDER BY c.id`;
      values = [req.user.id];
    } else if (resource === "households") {
      query = `SELECT h.id, u.full_name AS "fullName", u.email, h.collector_id AS "collectorId",
        h.address, h.district FROM households h JOIN users u ON u.id = h.user_id
        JOIN collectors c ON c.id = h.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = (SELECT company_id FROM representatives WHERE user_id = $1)
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) ORDER BY h.id`;
      values = [req.user.id];
    } else if (resource === "bins") {
      query = `SELECT b.id, b.household_id AS "householdId", b.bin_code AS "binCode",
        b.capacity, b.fill_level AS "fillLevel", b.status FROM waste_bins b
        JOIN households h ON h.id = b.household_id
        JOIN collectors c ON c.id = h.collector_id
        JOIN representatives r ON r.id = c.representative_id
        WHERE r.company_id = (SELECT company_id FROM representatives WHERE user_id = $1)
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) ORDER BY b.id`;
      values = [req.user.id];
    } else if (resource === "collections") {
      query = `SELECT cl.id, cl.household_id AS "householdId", cl.collector_id AS "collectorId",
        cl.scheduled_at AS "scheduledAt", cl.status FROM collections cl
        JOIN collectors c ON c.id = cl.collector_id
        JOIN representatives r ON r.id = c.representative_id
        JOIN households h ON h.id = cl.household_id
        WHERE r.company_id = (SELECT company_id FROM representatives WHERE user_id = $1)
          AND company_has_active_district(r.company_id, h.district)
          AND LOWER(BTRIM(c.district)) = LOWER(BTRIM(h.district)) ORDER BY cl.id`;
      values = [req.user.id];
    }
  }
  const result = await pool.query(query, values);
  if (req.user.role !== "ADMIN") {
    const representative = await pool.query(
      "SELECT company_id FROM representatives WHERE user_id = $1",
      [req.user.id]
    );
    if (representative.rows[0]) {
      const companyId = representative.rows[0].company_id;
      if (resource === "companies") return result.rows.filter((row) => row.id === companyId);
    }
  }
  return result.rows;
}

async function exportData(req, res) {
  const { resource, format } = req.params;
  if (!["csv", "xlsx", "pdf"].includes(format)) {
    throw new AppError(400, "format must be csv, xlsx, or pdf.", "VALIDATION_ERROR");
  }
  if (!Object.hasOwn(allowedResources, resource)) {
    throw new AppError(404, "Export resource not found.", "NOT_FOUND");
  }
  const definition = allowedResources[resource];
  const rows = await getScopedRows(req, resource);
  await auditModel.record({
    actorUserId: req.user.id,
    action: "DATA_EXPORTED",
    resourceType: resource,
    resourceId: format,
    ipAddress: req.ip,
    metadata: { format, rowCount: rows.length },
  });

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${resource}.csv"`);
    return res.send(toCsv(definition.columns, rows));
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(resource);
    sheet.columns = definition.columns.map((column) => ({
      header: column.label,
      key: column.key,
    }));
    sheet.addRows(rows);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${resource}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${resource}.pdf"`);
  const document = new PDFDocument({ margin: 40 });
  document.pipe(res);
  document.fontSize(16).text(`SWMS ${resource.toUpperCase()} Report`);
  document.moveDown();
  for (const row of rows) {
    const line = definition.columns
      .map((column) => `${column.label}: ${row[column.key] ?? ""}`)
      .join(" | ");
    document.fontSize(9).text(line);
  }
  document.end();
}

exports.exportData = exportData;
