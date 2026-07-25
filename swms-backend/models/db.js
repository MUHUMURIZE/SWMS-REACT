const { Pool } = require('pg');
//require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});


module.exports = pool;
console.log('DB_PASS:', process.env.DB_PASS);
console.log('Type:', typeof process.env.DB_PASS);
