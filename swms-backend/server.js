require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();

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

app.use(express.json());
app.use(cors());

// Import routes
const binRoutes = require('./routes/binRoutes');
const userRoutes = require('./routes/userRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');

// Mount routes
app.use('/bins', binRoutes);
app.use('/users', userRoutes);
app.use('/schedules', scheduleRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
