const pool = require('../models/db');

// CREATE - Add a new schedule
exports.addSchedule = async (req, res) => {
  const { bin_id, collector_id, date, status } = req.body;

  try {
    // Households cannot create schedules
    if (req.user.role === "household") {
      return res.status(403).json({ message: "Households cannot create schedules" });
    }

    // Collector: must only create schedules for their assigned bins
    if (req.user.role === "collector") {
      const assigned = await pool.query(
        "SELECT * FROM bins WHERE id = $1 AND collector_id = $2",
        [bin_id, req.user.id]
      );
      if (assigned.rows.length === 0) {
        return res.status(403).json({ message: "You can only schedule bins assigned to you" });
      }
    }

    const result = await pool.query(
      "INSERT INTO schedules (bin_id, collector_id, date, status, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [bin_id, collector_id, date, status, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// READ - Get all schedules
exports.getSchedules = async (req, res) => {
  try {
    let result;

    if (req.user.role === "household") {
      result = await pool.query(
        "SELECT * FROM schedules WHERE household_id = $1 ORDER BY id ASC",
        [req.user.id]
      );
    } else if (req.user.role === "collector") {
      result = await pool.query(
        "SELECT * FROM schedules WHERE collector_id = $1 ORDER BY id ASC",
        [req.user.id]
      );
    } else if (req.user.role === "company_representative") {
      result = await pool.query(
        "SELECT * FROM schedules WHERE company_rep_id = $1 ORDER BY id ASC",
        [req.user.id]
      );
    } else {
      result = await pool.query("SELECT * FROM schedules ORDER BY id ASC");
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// READ - Get one schedule by ID
exports.getScheduleById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM schedules WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Schedule not found");
    }

    const schedule = result.rows[0];

    // Role checks
    if (req.user.role === "household" && schedule.household_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this schedule" });
    }
    if (req.user.role === "collector" && schedule.collector_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this schedule" });
    }
    if (req.user.role === "company_representative" && schedule.company_rep_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this schedule" });
    }

    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// UPDATE - Update a schedule
exports.updateSchedule = async (req, res) => {
  const { id } = req.params;
  const { bin_id, collector_id, date, status } = req.body;

  try {
    const result = await pool.query("SELECT * FROM schedules WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Schedule not found");
    }

    const schedule = result.rows[0];

    // Role checks
    if (req.user.role === "household") {
      return res.status(403).json({ message: "Households cannot update schedules" });
    }
    if (req.user.role === "collector" && schedule.collector_id !== req.user.id) {
      return res.status(403).json({ message: "You can only update your assigned schedules" });
    }
    if (req.user.role === "company_representative" && schedule.company_rep_id !== req.user.id) {
      return res.status(403).json({ message: "You can only update schedules of your collectors" });
    }

    const updated = await pool.query(
      "UPDATE schedules SET bin_id=$1, collector_id=$2, date=$3, status=$4, updated_at=NOW() WHERE id=$5 RETURNING *",
      [bin_id, collector_id, date, status, id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// DELETE - Remove a schedule
exports.deleteSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM schedules WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Schedule not found");
    }

    // Only admin can delete
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete schedules" });
    }

    await pool.query("DELETE FROM schedules WHERE id=$1", [id]);
    res.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};
