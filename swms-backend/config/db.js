const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME,
  password: process.env.DB_PASS || process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  max: Number(process.env.DB_CONNECTION_LIMIT || 10),
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

module.exports = { pool };
