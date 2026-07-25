const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// Household: view schedules
router.get(
  "/",
  authenticateToken,
  authorizeRoles("household","collector","company_representative","admin"),
  scheduleController.getSchedules
);

// Collector & above: create/update schedules
router.post(
  "/",
  authenticateToken,
  authorizeRoles("collector","company_representative","admin"),
  scheduleController.addSchedule   // ✅ use addSchedule instead of createSchedule
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("collector","company_representative","admin"),
  scheduleController.updateSchedule
);

// Admin only: delete schedules
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  scheduleController.deleteSchedule
);

module.exports = router;
