require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
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
const schedulingRoutes = require("./routes/schedulingRoutes");
const reportRoutes = require("./routes/reportRoutes");
const exportRoutes = require("./routes/exportRoutes");
const { swaggerUi, swaggerSpec, swaggerOptions } = require("./docs/swagger");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const userModel = require("./models/userModel");
const { trustedProxyHops } = require("./config/proxy");
const { connectLoginRateLimiter } = require("./middleware/loginRateLimiter");
const districtAgreementService = require("./services/districtAgreementService");
const districtRoutes = require("./routes/districtRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");

const app = express();
app.set("trust proxy", trustedProxyHops(process.env.TRUST_PROXY_HOPS));

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
}
if (process.env.NODE_ENV === "production" && !(process.env.CORS_ORIGINS || "").trim()) {
  throw new Error("CORS_ORIGINS must contain at least one allowed origin in production.");
}

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0) {
      if (process.env.NODE_ENV === "production" && !origin) return callback(null, true);
      if (process.env.NODE_ENV === "production") return callback(new Error("Origin is not allowed."));
      return callback(null, true);
    }
    callback(null, allowedOrigins.includes(origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Audit-Reason"],
  exposedHeaders: ["Content-Disposition"],
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

const swaggerEnabled = process.env.NODE_ENV !== "production"
  || String(process.env.SWAGGER_ENABLED).toLowerCase() === "true";

app.get("/api-docs.json", (_req, res, next) => {
  if (!swaggerEnabled) return next();
  res.json(swaggerSpec);
});
if (swaggerEnabled) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
}

app.use("/api/auth", authRoutes);
app.use("/api", selfRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/districts", districtRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/representatives", representativeRoutes);
app.use("/api/collectors", collectorRoutes);
app.use("/api/households", householdRoutes);
app.use("/api/bins", binRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/collections/scheduling", schedulingRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/exports", exportRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
  connectLoginRateLimiter()
    .then(() => {
      districtAgreementService.expireDueAgreements().catch((error) => {
        console.error("Could not expire district agreements:", error);
      });
      const cleanup = setInterval(() => {
        userModel.purgeExpiredRevocations().catch((error) => {
          console.error("Could not purge expired revoked tokens:", error);
        });
      }, 60 * 60 * 1000);
      cleanup.unref();
      const agreementCleanup = setInterval(() => {
        districtAgreementService.expireDueAgreements().catch((error) => {
          console.error("Could not expire district agreements:", error);
        });
      }, 60 * 60 * 1000);
      agreementCleanup.unref();
      app.listen(port, () => {
        console.log(`SWMS API listening on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Could not connect the login rate limiter:", error);
      process.exitCode = 1;
    });
}

module.exports = app;
