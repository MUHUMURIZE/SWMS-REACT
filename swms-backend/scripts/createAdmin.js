require("dotenv").config();

const bcrypt = require("bcrypt");
const { pool } = require("../config/db");

async function createAdmin() {
  const { BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, JWT_SECRET } = process.env;
  if (!BOOTSTRAP_ADMIN_NAME || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error("Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD first.");
  }
  if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long.");
  }
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }

  const admins = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
  if (admins.rowCount) throw new Error("An admin account already exists; use the authenticated registration endpoint.");

  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  await pool.query(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN')",
    [BOOTSTRAP_ADMIN_NAME.trim(), BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
  );
  console.log(`Initial administrator created for ${BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()}.`);
}

createAdmin()
  .catch((error) => {
    console.error(`Could not create the initial administrator: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
