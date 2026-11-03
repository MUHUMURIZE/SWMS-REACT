const binService = require("../services/binService");

exports.list = async (req, res) => {
  res.json({ data: await binService.list(req.user) });
};

exports.listFull = async (req, res) => {
  res.json({ data: await binService.list(req.user, true) });
};

exports.get = async (req, res) => {
  res.json({ data: await binService.get(req.user, req.params.id) });
};

exports.create = async (req, res) => {
  res.status(201).json({ data: await binService.create(req.user, req.body) });
};

exports.update = async (req, res) => {
  res.json({ data: await binService.update(req.user, req.params.id, req.body) });
};

exports.remove = async (req, res) => {
  await binService.remove(req.user, req.params.id);
  res.status(204).end();
};

exports.updateProgress = async (req, res) => {
  res.json({ data: await binService.updateProgress(req.user, req.params.id, req.body.fillLevel) });
};

exports.empty = async (req, res) => {
  res.json({ data: await binService.empty(req.user, req.params.id) });
};

exports.myBin = async (req, res) => {
  res.json({ data: await binService.myBin(req.user.id) });
};
