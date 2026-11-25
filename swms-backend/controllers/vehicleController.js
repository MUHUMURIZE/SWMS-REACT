const vehicleService = require("../services/vehicleService");

exports.list = async (req, res) => {
  res.json({ data: await vehicleService.list(req.user, req.pagination) });
};

exports.get = async (req, res) => {
  res.json({ data: await vehicleService.get(req.user, req.params.id) });
};

exports.create = async (req, res) => {
  res.status(201).json({ data: await vehicleService.create(req.user, req.body) });
};

exports.update = async (req, res) => {
  res.json({ data: await vehicleService.update(req.user, req.params.id, req.body) });
};

exports.setStatus = async (req, res) => {
  res.json({
    data: await vehicleService.setStatus(req.user, req.params.id, req.body.status),
  });
};

exports.assign = async (req, res) => {
  res.json({
    data: await vehicleService.assign(req.user, req.params.id, req.body.collectorId),
  });
};

exports.unassign = async (req, res) => {
  res.json({ data: await vehicleService.unassign(req.user, req.params.id) });
};

exports.assignmentHistory = async (req, res) => {
  res.json({
    data: await vehicleService.assignmentHistory(req.user, req.params.id, req.pagination),
  });
};

exports.maintenanceHistory = async (req, res) => {
  res.json({
    data: await vehicleService.maintenanceHistory(req.user, req.params.id, req.pagination),
  });
};

exports.scheduleMaintenance = async (req, res) => {
  res.status(201).json({
    data: await vehicleService.scheduleMaintenance(req.user, req.params.id, req.body),
  });
};

exports.updateMaintenanceStatus = async (req, res) => {
  res.json({
    data: await vehicleService.updateMaintenanceStatus(
      req.user,
      req.params.id,
      req.params.maintenanceId,
      req.body.status
    ),
  });
};
