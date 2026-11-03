require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { pool } = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const representativeRoutes = require("./routes/representativeRoutes");
const collectorRoutes = require("./routes/collectorRoutes");
const householdRoutes = require("./routes/householdRoutes");
const binRoutes = require("./routes/binRoutes");
const collectionRoutes = require("./routes/collectionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const selfRoutes = require("./routes/selfRoutes");
const { swaggerUi, swaggerSpec, swaggerOptions } = require("./docs/swagger");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.get("/api-docs.json", (_req, res) => {
  res.json(swaggerSpec);
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));

app.use("/api/auth", authRoutes);
app.use("/api", selfRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/representatives", representativeRoutes);
app.use("/api/collectors", collectorRoutes);
app.use("/api/households", householdRoutes);
app.use("/api/bins", binRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`SWMS API listening on port ${port}`);
  });
}

module.exports = app;
