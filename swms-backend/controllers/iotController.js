const trackingService = require("../services/deviceService");

exports.registerBinDevice = async (req, res) => {
  res.status(201).json({ data: await trackingService.registerDevice(req.user, "BIN", req.body.deviceCode) });
};

exports.listBinDevices = async (req, res) => {
  res.json({ data: await trackingService.listDevices(req.user, "BIN", req.pagination) });
};

exports.associateBinDevice = async (req, res) => {
  res.json({
    data: await trackingService.associateDevice(
      req.user, "BIN", req.params.id, req.body.resourceId
    ),
  });
};

exports.rotateBinCredential = async (req, res) => {
  res.json({ data: await trackingService.rotateCredential(req.user, "BIN", req.params.id) });
};

exports.revokeBinDevice = async (req, res) => {
  await trackingService.revokeDevice(req.user, "BIN", req.params.id);
  res.status(204).end();
};

exports.latestBinReading = async (req, res) => {
  res.json({ data: await trackingService.latestBinReading(req.user, req.params.binId) });
};

exports.binReadingHistory = async (req, res) => {
  res.json({
    data: await trackingService.binReadingHistory(req.user, req.params.binId, req.pagination),
  });
};

exports.alerts = async (req, res) => {
  res.json({ data: await trackingService.listBinAlerts(req.user, req.pagination) });
};

exports.ingestTelemetry = async (req, res) => {
  res.status(202).json({ data: await trackingService.ingestTelemetry(req.device, req.body) });
};
