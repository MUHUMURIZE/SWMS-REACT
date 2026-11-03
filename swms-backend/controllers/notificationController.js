const notificationModel = require("../models/notificationModel");
const AppError = require("../utils/AppError");

exports.list = async (req, res) => {
  res.json({ data: await notificationModel.listForUser(req.user.id) });
};

exports.markRead = async (req, res) => {
  if (!(await notificationModel.markRead(req.params.id, req.user.id))) {
    throw new AppError(404, "Notification not found.", "NOT_FOUND");
  }
  res.json({ data: { id: req.params.id, read: true } });
};
