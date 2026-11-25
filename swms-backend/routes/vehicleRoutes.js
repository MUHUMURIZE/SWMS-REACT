const express = require("express");
const router = express.Router();
const controller = require("../controllers/vehicleController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const {
  authorizeVehicleManager,
  authorizeVehicleReader,
} = require("../middleware/authorization");
const { validateBody, validateIds, requireRoleFields } = require("../middleware/validate");
const validatePagination = require("../middleware/pagination");
const schemas = require("../validation/schemas");

router.use(authenticateToken);
router.get("/", authorizeVehicleReader, validatePagination, asyncHandler(controller.list));
router.post(
  "/",
  authorizeVehicleManager,
  validateBody(schemas.vehicleCreate),
  requireRoleFields({ ADMIN: ["companyId"] }),
  asyncHandler(controller.create)
);
router.get(
  "/:id/assignments",
  authorizeVehicleReader,
  validateIds("id"),
  validatePagination,
  asyncHandler(controller.assignmentHistory)
);
router.get(
  "/:id/maintenance",
  authorizeVehicleReader,
  validateIds("id"),
  validatePagination,
  asyncHandler(controller.maintenanceHistory)
);
router.post(
  "/:id/maintenance",
  authorizeVehicleManager,
  validateIds("id"),
  validateBody(schemas.vehicleMaintenanceCreate),
  asyncHandler(controller.scheduleMaintenance)
);
router.put(
  "/:id/maintenance/:maintenanceId/status",
  authorizeVehicleManager,
  validateIds("id", "maintenanceId"),
  validateBody(schemas.vehicleMaintenanceStatus),
  asyncHandler(controller.updateMaintenanceStatus)
);
router.put(
  "/:id/assignment",
  authorizeVehicleManager,
  validateIds("id"),
  validateBody(schemas.vehicleAssignment),
  asyncHandler(controller.assign)
);
router.delete(
  "/:id/assignment",
  authorizeVehicleManager,
  validateIds("id"),
  asyncHandler(controller.unassign)
);
router.put(
  "/:id/status",
  authorizeVehicleManager,
  validateIds("id"),
  validateBody(schemas.vehicleStatus),
  asyncHandler(controller.setStatus)
);
router.put(
  "/:id",
  authorizeVehicleManager,
  validateIds("id"),
  validateBody(schemas.vehicleUpdate),
  asyncHandler(controller.update)
);
router.get(
  "/:id",
  authorizeVehicleReader,
  validateIds("id"),
  asyncHandler(controller.get)
);

module.exports = router;
