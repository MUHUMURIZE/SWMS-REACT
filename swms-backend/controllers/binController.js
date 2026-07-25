const pool = require('../models/db');

// CREATE - Add a new bin
exports.addBin = async (req, res) => {
  const { location, status, capacity } = req.body;

  try {
    // Only collector, company_rep, admin can add bins
    if (req.user.role === "household") {
      return res.status(403).json({ message: "Households cannot add bins" });
    }

    // If collector → must be assigned
    if (req.user.role === "collector") {
      // Example check: collector_id must match logged-in user
      // Adjust query if you store collector_id in bins table
      const assigned = await pool.query(
        "SELECT * FROM collectors WHERE id = $1",
        [req.user.id]
      );
      if (assigned.rows.length === 0) {
        return res.status(403).json({ message: "You are not assigned to manage bins" });
      }
    }

    const result = await pool.query(
      "INSERT INTO bins (location, status, capacity, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [location, status, capacity, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// READ - Get all bins
exports.getBins = async (req, res) => {
  try {
    let result;

    if (req.user.role === "household") {
      // Household: only view bins assigned to them
      result = await pool.query(
        "SELECT * FROM bins WHERE household_id = $1 ORDER BY id ASC",
        [req.user.id]
      );
    } else if (req.user.role === "collector") {
      // Collector: only bins of their households
      result = await pool.query(
        "SELECT * FROM bins WHERE collector_id = $1 ORDER BY id ASC",
        [req.user.id]
      );
    } else if (req.user.role === "company_representative") {
      // Company rep: bins of collectors they manage
      result = await pool.query(
        "SELECT * FROM bins WHERE company_rep_id = $1 ORDER BY id ASC",
        [req.user.id]
      );
    } else {
      // Admin: all bins
      result = await pool.query("SELECT * FROM bins ORDER BY id ASC");
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// READ - Get one bin by ID
exports.getBinById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM bins WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Bin not found");
    }

    const bin = result.rows[0];

    // Role checks
    if (req.user.role === "household" && bin.household_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this bin" });
    }
    if (req.user.role === "collector" && bin.collector_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this bin" });
    }
    if (req.user.role === "company_representative" && bin.company_rep_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this bin" });
    }

    res.json(bin);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// UPDATE - Update a bin
exports.updateBin = async (req, res) => {
  const { id } = req.params;
  const { location, status, capacity } = req.body;

  try {
    const result = await pool.query("SELECT * FROM bins WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Bin not found");
    }

    const bin = result.rows[0];

    // Role checks
    if (req.user.role === "household") {
      return res.status(403).json({ message: "Households cannot update bins" });
    }
    if (req.user.role === "collector" && bin.collector_id !== req.user.id) {
      return res.status(403).json({ message: "You can only update your assigned bins" });
    }
    if (req.user.role === "company_representative" && bin.company_rep_id !== req.user.id) {
      return res.status(403).json({ message: "You can only update bins of your collectors" });
    }

    const updated = await pool.query(
      "UPDATE bins SET location=$1, status=$2, capacity=$3 WHERE id=$4 RETURNING *",
      [location, status, capacity, id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};

// DELETE - Remove a bin
exports.deleteBin = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM bins WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Bin not found");
    }

    const bin = result.rows[0];

    // Only admin can delete
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete bins" });
    }

    await pool.query("DELETE FROM bins WHERE id=$1", [id]);
    res.json({ message: "Bin deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
};
