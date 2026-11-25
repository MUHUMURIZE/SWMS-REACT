const { pool } = require("../config/db");

const selection = `SELECT v.id, v.company_id AS "companyId", v.registration_number AS "registrationNumber",
  v.vehicle_type AS "vehicleType", v.make, v.model, v.capacity::float8 AS capacity,
  v.fuel_type AS "fuelType",
  v.operational_status AS status, v.registration_expires_on::text AS "registrationExpiresOn",
  v.insurance_expires_on::text AS "insuranceExpiresOn",
  v.inspection_expires_on::text AS "inspectionExpiresOn",
  v.assigned_collector_id AS "assignedCollectorId", assigned_user.full_name AS "assignedCollectorName",
  assigned.district AS "assignedCollectorDistrict", v.created_at AS "createdAt",
  v.updated_at AS "updatedAt"
  FROM fleet_vehicles v
  LEFT JOIN collectors assigned ON assigned.id = v.assigned_collector_id
  LEFT JOIN users assigned_user ON assigned_user.id = assigned.user_id`;

exports.list = async ({ companyId, collectorId } = {}, pagination = { limit: 50, offset: 0 }) => {
  const values = [];
  let where = "";
  if (companyId !== undefined) {
    values.push(companyId);
    where = `WHERE v.company_id = $${values.length}`;
  } else if (collectorId !== undefined) {
    values.push(collectorId);
    where = `WHERE v.assigned_collector_id = $${values.length}
      AND company_has_active_district(v.company_id, assigned.district)`;
  }
  values.push(pagination.limit, pagination.offset);
  const result = await pool.query(
    `${selection} ${where} ORDER BY v.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
};

exports.findById = async (id, executor = pool, lock = false) => {
  const result = await executor.query(
    `${selection} WHERE v.id = $1${lock ? " FOR UPDATE OF v" : ""}`,
    [id]
  );
  return result.rows[0] || null;
};

exports.create = async (executor, {
  companyId,
  registrationNumber,
  vehicleType,
  make,
  model,
  capacity,
  fuelType,
  registrationExpiresOn,
  insuranceExpiresOn,
  inspectionExpiresOn,
  createdBy,
}) => {
  const result = await executor.query(
    `INSERT INTO fleet_vehicles
      (company_id, registration_number, vehicle_type, make, model, capacity, fuel_type,
       registration_expires_on, insurance_expires_on, inspection_expires_on, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      companyId,
      registrationNumber,
      vehicleType,
      make || null,
      model || null,
      capacity,
      fuelType,
      registrationExpiresOn || null,
      insuranceExpiresOn || null,
      inspectionExpiresOn || null,
      createdBy,
    ]
  );
  return result.rows[0].id;
};

exports.update = async (executor, id, changes) => {
  await executor.query(
    `UPDATE fleet_vehicles SET
      registration_number = COALESCE($1, registration_number),
      vehicle_type = COALESCE($2, vehicle_type),
      make = COALESCE($3, make),
      model = COALESCE($4, model),
      capacity = COALESCE($5, capacity),
      fuel_type = COALESCE($6, fuel_type),
      registration_expires_on = COALESCE($7, registration_expires_on),
      insurance_expires_on = COALESCE($8, insurance_expires_on),
      inspection_expires_on = COALESCE($9, inspection_expires_on)
     WHERE id = $10`,
    [
      changes.registrationNumber ?? null,
      changes.vehicleType ?? null,
      changes.make ?? null,
      changes.model ?? null,
      changes.capacity ?? null,
      changes.fuelType ?? null,
      changes.registrationExpiresOn ?? null,
      changes.insuranceExpiresOn ?? null,
      changes.inspectionExpiresOn ?? null,
      id,
    ]
  );
  return exports.findById(id, executor);
};

exports.assign = async (executor, id, collectorId) => {
  await executor.query(
    `UPDATE fleet_vehicles
     SET assigned_collector_id = $1, operational_status = 'IN_SERVICE'
     WHERE id = $2`,
    [collectorId, id]
  );
  return exports.findById(id, executor);
};

exports.setStatus = async (executor, id, status) => {
  await executor.query("UPDATE fleet_vehicles SET operational_status = $1 WHERE id = $2", [status, id]);
  return exports.findById(id, executor);
};

exports.recordAssignment = async (executor, id, collectorId, collectorName, actorUserId) => {
  await executor.query(
    `INSERT INTO vehicle_assignment_history
      (vehicle_id, collector_id, collector_name, assigned_by)
     VALUES ($1, $2, $3, $4)`,
    [id, collectorId, collectorName, actorUserId]
  );
};

exports.closeAssignment = async (executor, id, actorUserId) => {
  await executor.query(
    `UPDATE vehicle_assignment_history
     SET unassigned_at = CURRENT_TIMESTAMP, unassigned_by = $2
     WHERE vehicle_id = $1 AND unassigned_at IS NULL`,
    [id, actorUserId]
  );
};

exports.listAssignmentHistory = async (id, pagination) => {
  const result = await pool.query(
    `SELECT id, collector_id AS "collectorId", collector_name AS "collectorName",
      assigned_by AS "assignedBy", assigned_at AS "assignedAt",
      unassigned_by AS "unassignedBy", unassigned_at AS "unassignedAt"
     FROM vehicle_assignment_history
     WHERE vehicle_id = $1
     ORDER BY assigned_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [id, pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.listMaintenance = async (id, pagination) => {
  const result = await pool.query(
    `SELECT id, description, service_provider AS "serviceProvider",
      scheduled_for::text AS "scheduledFor",       status, cost::float8 AS cost, odometer_km AS "odometerKm",
      completed_at AS "completedAt", created_at AS "createdAt"
     FROM vehicle_maintenance
     WHERE vehicle_id = $1
     ORDER BY scheduled_for DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [id, pagination.limit, pagination.offset]
  );
  return result.rows;
};

exports.createMaintenance = async (executor, id, {
  description,
  serviceProvider,
  scheduledFor,
  cost,
  odometerKm,
  createdBy,
}) => {
  const result = await executor.query(
    `INSERT INTO vehicle_maintenance
      (vehicle_id, description, service_provider, scheduled_for, cost, odometer_km, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [id, description, serviceProvider || null, scheduledFor, cost ?? null, odometerKm ?? null, createdBy]
  );
  return result.rows[0].id;
};

exports.findMaintenanceById = async (id, maintenanceId, executor = pool, lock = false) => {
  const result = await executor.query(
    `SELECT id, vehicle_id AS "vehicleId", description,
      service_provider AS "serviceProvider", scheduled_for::text AS "scheduledFor",
      status, cost, odometer_km AS "odometerKm", completed_at AS "completedAt"
     FROM vehicle_maintenance
     WHERE vehicle_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`,
    [id, maintenanceId]
  );
  return result.rows[0] || null;
};

exports.transitionMaintenance = async (executor, id, maintenanceId, status) => {
  await executor.query(
    `UPDATE vehicle_maintenance
     SET status = $1,
       completed_at = CASE WHEN $1 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE vehicle_id = $2 AND id = $3`,
    [status, id, maintenanceId]
  );
  return exports.findMaintenanceById(id, maintenanceId, executor);
};
