const binService = require("../services/binService");
const auditModel = require("../models/auditModel");

exports.list = async (req, res) => {
  res.json({ data: await binService.list(req.user, false, req.pagination) });
};

exports.listFull = async (req, res) => {
  res.json({ data: await binService.list(req.user, true, req.pagination) });
};

exports.get = async (req, res) => {
  res.json({ data: await binService.get(req.user, req.params.id) });
};

exports.create = async (req, res) => {
  const bin = await binService.create(req.user, req.body);
  await auditModel.record({
    actorUserId: req.user.id,
    action: "BIN_CREATED",
    resourceType: "WASTE_BIN",
    resourceId: bin.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ data: bin });
};

exports.update = async (req, res) => {
  res.json({ data: await binService.update(req.user, req.params.id, req.body) });
};

exports.remove = async (req, res) => {
  await binService.remove(req.user, req.params.id);
  res.status(204).end();
};

exports.updateProgress = async (req, res) => {
  const bin = await binService.updateProgress(req.user, req.params.id, req.body.fillLevel);
  await auditModel.record({
    actorUserId: req.user.id,
    action: "BIN_FILL_UPDATED",
    resourceType: "WASTE_BIN",
    resourceId: req.params.id,
    ipAddress: req.ip,
    metadata: { fillLevel: req.body.fillLevel },
  });
  res.json({ data: bin });
};

exports.empty = async (req, res) => {
  res.json({ data: await binService.empty(req.user, req.params.id) });
};

exports.updateLocation = async (req, res) => {
  const bin = await binService.updateLocation(req.user, req.params.id, req.body);
  await auditModel.record({
    actorUserId: req.user.id,
    action: "BIN_LOCATION_CAPTURED",
    resourceType: "WASTE_BIN",
    resourceId: req.params.id,
    ipAddress: req.ip,
    metadata: {
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      locationAccuracy: req.body.locationAccuracy ?? null,
    },
  });
  res.json({ data: bin });
};

exports.myBin = async (req, res) => {
  res.json({ data: await binService.myBin(req.user.id) });
};
