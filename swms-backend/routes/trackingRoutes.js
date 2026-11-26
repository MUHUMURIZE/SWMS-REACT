const express = require("express");
const router = express.Router();
const controller = require("../controllers/trackingController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authenticateDevice } = require("../middleware/deviceAuthentication");
const { authorizeAdminOrRepresentative, authorizeVehicleReader } = require("../middleware/authorization");
const { validateBody, validateIds } = require("../middleware/validate");
const validatePagination = require("../middleware/pagination");
const schemas = require("../validation/schemas");
const {
  deviceIngestionIpRequests,
  gpsDeviceIngestionRequests,
} = require("../middleware/loginRateLimiter");

router.post(
  "/ingest",
  deviceIngestionIpRequests,
  authenticateDevice,
  gpsDeviceIngestionRequests,
  validateBody(schemas.gpsLocation),
  asyncHandler(controller.ingestLocation)
);
router.get("/map", authenticateToken, authorizeVehicleReader, asyncHandler(controller.map));
router.get("/devices", authenticateToken, authorizeAdminOrRepresentative, validatePagination, asyncHandler(controller.listGpsDevices));
router.post("/devices", authenticateToken, authorizeAdminOrRepresentative, validateBody(schemas.gpsDeviceCreate), asyncHandler(controller.registerGpsDevice));
router.put("/devices/:id/vehicle", authenticateToken, authorizeAdminOrRepresentative, validateIds("id"), validateBody(schemas.deviceAssociation), asyncHandler(controller.associateGpsDevice));
router.post("/devices/:id/rotate-credential", authenticateToken, authorizeAdminOrRepresentative, validateIds("id"), asyncHandler(controller.rotateGpsCredential));
router.delete("/devices/:id", authenticateToken, authorizeAdminOrRepresentative, validateIds("id"), asyncHandler(controller.revokeGpsDevice));
router.get("/vehicles/:vehicleId/location", authenticateToken, authorizeVehicleReader, validateIds("vehicleId"), asyncHandler(controller.latestLocation));
router.get("/vehicles/:vehicleId/history", authenticateToken, authorizeVehicleReader, validateIds("vehicleId"), validatePagination, asyncHandler(controller.locationHistory));

module.exports = router;
