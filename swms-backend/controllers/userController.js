const pool = require('../models/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ---------------- REGISTER ----------------
exports.registerUser = async (req, res) => {
  const { 
    username, email, password, role, phone_number, address, 
    national_id, vehicle_plate, company_name, department 
  } = req.body;

  try {
    // Check duplicate email
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Role hierarchy enforcement
    if (req.user.role === "admin") {
      // Admin can register any role
    } else if (req.user.role === "company_representative") {
      if (!["collector", "household"].includes(role)) {
        return res.status(403).json({ message: "Company reps can only register collectors or households" });
      }
    } else if (req.user.role === "collector") {
      if (role !== "household") {
        return res.status(403).json({ message: "Collectors can only register households" });
      }
    } else {
      return res.status(403).json({ message: "Households cannot register new users" });
    }

    // Insert into users table
    const userResult = await pool.query(
      `INSERT INTO users (
        username, email, password, role, phone_number, address, national_id, 
        vehicle_plate, company_name, department, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      RETURNING id, role`,
      [username, email, hashedPassword, role, phone_number, address, national_id, 
       vehicle_plate, company_name, department]
    );

    const newUser = userResult.rows[0];

    // Link to hierarchy tables
    if (role === "company_representative") {
      await pool.query(
        `INSERT INTO company_representatives (user_id, company_name, department)
         VALUES ($1,$2,$3)`,
        [newUser.id, company_name, department]
      );
    }

    if (role === "collector") {
      const repResult = await pool.query("SELECT id FROM company_representatives WHERE user_id=$1", [req.user.id]);
      if (repResult.rows.length === 0) return res.status(400).json({ message: "Company representative record not found" });
      const companyRepId = repResult.rows[0].id;

      await pool.query(
        `INSERT INTO collectors (user_id, company_rep_id, vehicle_plate)
         VALUES ($1,$2,$3)`,
        [newUser.id, companyRepId, vehicle_plate]
      );
    }

    if (role === "household") {
      const collectorResult = await pool.query("SELECT id FROM collectors WHERE user_id=$1", [req.user.id]);
      if (collectorResult.rows.length === 0) return res.status(400).json({ message: "Collector record not found" });
      const collectorId = collectorResult.rows[0].id;

      await pool.query(
        `INSERT INTO households (user_id, collector_id, address, national_id)
         VALUES ($1,$2,$3,$4)`,
        [newUser.id, collectorId, address, national_id]
      );
    }

    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------- LOGIN ----------------
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid email or password' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const { password: _, ...safeUser } = user;

    res.json({ message: 'Login successful', user: safeUser, token });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------- GET USERS ----------------
exports.getUsers = async (req, res) => {
  try {
    let result;
    if (req.user.role === "admin") {
      result = await pool.query("SELECT id, username, email, role, created_at, updated_at FROM users");
    } else if (req.user.role === "company_representative") {
      const repResult = await pool.query("SELECT id FROM company_representatives WHERE user_id=$1", [req.user.id]);
      const repId = repResult.rows[0].id;
      result = await pool.query(`
        SELECT u.id, u.username, u.email, u.role, u.created_at, u.updated_at
        FROM users u
        WHERE u.id IN (
          SELECT c.user_id FROM collectors c WHERE c.company_rep_id=$1
          UNION
          SELECT h.user_id FROM households h
          JOIN collectors c ON h.collector_id=c.id
          WHERE c.company_rep_id=$1
        )
      `, [repId]);
    } else if (req.user.role === "collector") {
      const collectorResult = await pool.query("SELECT id FROM collectors WHERE user_id=$1", [req.user.id]);
      const collectorId = collectorResult.rows[0].id;
      result = await pool.query(`
        SELECT u.id, u.username, u.email, u.role, u.created_at, u.updated_at
        FROM users u
        WHERE u.id IN (SELECT h.user_id FROM households h WHERE h.collector_id=$1)
      `, [collectorId]);
    } else if (req.user.role === "household") {
      result = await pool.query("SELECT id, username, email, role, created_at, updated_at FROM users WHERE id=$1", [req.user.id]);
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------- GET USER BY ID ----------------
exports.getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT id, username, email, role, created_at, updated_at FROM users WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
    const user = result.rows[0];

    if (req.user.role === "admin") return res.json(user);

    if (req.user.role === "company_representative") {
      const repResult = await pool.query("SELECT id FROM company_representatives WHERE user_id=$1", [req.user.id]);
      const repId = repResult.rows[0].id;
      const check = await pool.query(`
        SELECT u.id FROM users u
        WHERE u.id=$1 AND (
          u.id IN (SELECT c.user_id FROM collectors c WHERE c.company_rep_id=$2)
          OR u.id IN (
            SELECT h.user_id FROM households h
            JOIN collectors c ON h.collector_id=c.id
            WHERE c.company_rep_id=$2
          )
        )
      `, [id, repId]);
      if (check.rows.length === 0 && req.user.id != id) return res.status(403).json({ message: "Not authorized" });
    }

    if (req.user.role === "collector") {
      const collectorResult = await pool.query("SELECT id FROM collectors WHERE user_id=$1", [req.user.id]);
      const collectorId = collectorResult.rows[0].id;
      const check = await pool.query("SELECT user_id FROM households WHERE user_id=$1 AND collector_id=$2", [id, collectorId]);
      if (check.rows.length === 0 && req.user.id != id) return res.status(403).json({ message: "Not authorized" });
    }

    if (req.user.role === "household" && req.user.id != id) {
      return res.status(403).json({ message: "Households can only view themselves" });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------- UPDATE USER ----------------
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, email, password, role, phone_number, address, national_id, vehicle_plate, company_name, department } = req.body;

  try {
    // Ownership checks
    if (req.user.role !== "admin") {
      if (req.user.role === "company_representative") {
        const repResult = await pool.query("SELECT id FROM company_representatives WHERE user_id=$1", [req.user.id]);
        const repId = repResult.rows[0].id;
        const check = await pool.query(`
          SELECT u.id FROM users u
          WHERE u.id=$1 AND (
            u.id IN (SELECT c.user_id FROM collectors c WHERE c.company_rep_id=$2)
            OR u.id IN (
              SELECT h.user_id FROM households h
              JOIN collectors c ON h.collector_id=c.id
              WHERE c.company_rep_id=$2
            )
          )
        `, [id, repId]);
        if (check.rows.length === 0 && req.user.id != id) return res.status(403).json({ message: "Not authorized" });
      } else if (req.user.role === "collector") {
        const collectorResult = await pool.query("SELECT id FROM collectors WHERE user_id=$1", [req.user.id]);
        const collectorId = collectorResult.rows[0].id;
        const check = await pool.query("SELECT user_id FROM households WHERE user_id=$1 AND collector_id=$2", [id, collectorId]);
        if (check.rows.length === 0 && req.user.id != id) return res.status(403).json({ message: "Not authorized" });
      } else if (req.user.role === "household" && req.user.id != id) {
        return res.status(403).json({ message: "Households can only update themselves" });
      }
    }

    let hashedPassword = null;
    if (password) hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           email = COALESCE($2, email),
           password = COALESCE($3, password),
           role = COALESCE($4, role),
           phone_number = COALESCE($5, phone_number),
           address = COALESCE($6, address),
           national_id = COALESCE($7, national_id),
           vehicle_plate = COALESCE($8, vehicle_plate),
           company_name = COALESCE($9, company_name),
           department = COALESCE($10, department),
           updated_at = NOW()
       WHERE id=$11
       RETURNING id, username, email, role, phone_number, address, national_id, vehicle_plate, company_name, department, created_at, updated_at`,
      [username, email, hashedPassword, role, phone_number, address, national_id, vehicle_plate, company_name, department, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User updated successfully", user: result.rows[0] });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------- DELETE USER ----------------
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== "admin") {
      if (req.user.role === "company_representative") {
        const repResult = await pool.query("SELECT id FROM company_representatives WHERE user_id=$1", [req.user.id]);
        const repId = repResult.rows[0].id;
        const check = await pool.query(`
          SELECT u.id FROM users u
          WHERE u.id=$1 AND (
            u.id IN (SELECT c.user_id FROM collectors c WHERE c.company_rep_id=$2)
            OR u.id IN (
              SELECT h.user_id FROM households h
              JOIN collectors c ON h.collector_id=c.id
              WHERE c.company_rep_id=$2
            )
          )
        `, [id, repId]);
        if (check.rows.length === 0) return res.status(403).json({ message: "Not authorized" });
      } else if (req.user.role === "collector") {
        const collectorResult = await pool.query("SELECT id FROM collectors WHERE user_id=$1", [req.user.id]);
        const collectorId = collectorResult.rows[0].id;
        const check = await pool.query("SELECT user_id FROM households WHERE user_id=$1 AND collector_id=$2", [id, collectorId]);
        if (check.rows.length === 0) return res.status(403).json({ message: "Not authorized" });
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const result = await pool.query("DELETE FROM users WHERE id=$1 RETURNING id, username, email, role", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted successfully", deleted: result.rows[0] });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: err.message });
  }
};
