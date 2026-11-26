const express = require("express");
const router = express.Router();
const controller = require("../controllers/iotController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authenticateDevice } = require("../middleware/deviceAuthentication");
const {
  authorizeAdminOrRepresentative,
  authorizeVehicleReader,
} = require("../middleware/authorization");
const { validateBody, validateIds } = require("../middleware/validate");
const validatePagination = require("../middleware/pagination");
const schemas = require("../validation/schemas");
const {
  deviceIngestionIpRequests,
  iotDeviceIngestionRequests,
} = require("../middleware/loginRateLimiter");

router.post(
  "/ingest",
  deviceIngestionIpRequests,
  authenticateDevice,
  iotDeviceIngestionRequests,
  validateBody(schemas.binTelemetry),
  asyncHandler(controller.ingestTelemetry)
);
router.get("/alerts", authenticateToken, authorizeVehicleReader, validatePagination, asyncHandler(controller.alerts));
router.get("/devices", authenticateToken, authorizeAdminOrRepresentative, validatePagination, asyncHandler(controller.listBinDevices));
router.post("/devices", authenticateToken, authorizeAdminOrRepresentative, validateBody(schemas.binDeviceCreate), asyncHandler(controller.registerBinDevice));
router.put("/devices/:id/bin", authenticateToken, authorizeAdminOrRepresentative, validateIds("id"), validateBody(schemas.deviceAssociation), asyncHandler(controller.associateBinDevice));
router.post("/devices/:id/rotate-credential", authenticateToken, authorizeAdminOrRepresentative, validateIds("id"), asyncHandler(controller.rotateBinCredential));
router.delete("/devices/:id", authenticateToken, authorizeAdminOrRepresentative, validateIds("id"), asyncHandler(controller.revokeBinDevice));
router.get("/bins/:binId/latest", authenticateToken, authorizeVehicleReader, validateIds("binId"), asyncHandler(controller.latestBinReading));
router.get("/bins/:binId/readings", authenticateToken, authorizeVehicleReader, validateIds("binId"), validatePagination, asyncHandler(controller.binReadingHistory));

module.exports = router;
