const collectionModel = require("../models/collectionModel");

async function scopedSchedule(req) {
  return {
    role: req.user.role,
    userId: req.user.id,
    pagination: req.pagination,
  };
}

exports.upcoming = async (req, res) => {
  res.json({ data: await collectionModel.listScheduling(await scopedSchedule(req), "upcoming") });
};

exports.missed = async (req, res) => {
  res.json({ data: await collectionModel.listScheduling(await scopedSchedule(req), "missed") });
};

exports.overdue = async (req, res) => {
  res.json({ data: await collectionModel.listScheduling(await scopedSchedule(req), "overdue") });
};

exports.rescheduled = async (req, res) => {
  res.json({ data: await collectionModel.listScheduling(await scopedSchedule(req), "rescheduled") });
};
