const trackingService = require("../services/deviceService");

exports.registerGpsDevice = async (req, res) => {
  res.status(201).json({ data: await trackingService.registerDevice(req.user, "GPS", req.body.deviceCode) });
};

exports.listGpsDevices = async (req, res) => {
  res.json({ data: await trackingService.listDevices(req.user, "GPS", req.pagination) });
};

exports.associateGpsDevice = async (req, res) => {
  res.json({
    data: await trackingService.associateDevice(
      req.user, "GPS", req.params.id, req.body.resourceId
    ),
  });
};

exports.rotateGpsCredential = async (req, res) => {
  res.json({ data: await trackingService.rotateCredential(req.user, "GPS", req.params.id) });
};

exports.revokeGpsDevice = async (req, res) => {
  await trackingService.revokeDevice(req.user, "GPS", req.params.id);
  res.status(204).end();
};

exports.map = async (req, res) => {
  res.json({ data: await trackingService.mapVehicles(req.user) });
};

exports.latestLocation = async (req, res) => {
  res.json({ data: await trackingService.latestLocation(req.user, req.params.vehicleId) });
};

exports.locationHistory = async (req, res) => {
  res.json({
    data: await trackingService.locationHistory(req.user, req.params.vehicleId, req.pagination),
  });
};

exports.ingestLocation = async (req, res) => {
  res.status(202).json({ data: await trackingService.ingestLocation(req.device, req.body) });
};
