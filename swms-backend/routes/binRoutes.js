const express = require("express");
const router = express.Router();
const binController = require("../controllers/binController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// Household: view bins
router.get(
  "/",
  authenticateToken,
  authorizeRoles("household","collector","company_representative","admin"),
  binController.getBins
);

// Collector & above: create/update bins
router.post(
  "/",
  authenticateToken,
  authorizeRoles("collector","company_representative","admin"),
  binController.addBin   // ✅ use addBin instead of createBin
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("collector","company_representative","admin"),
  binController.updateBin
);

// Admin only: delete bins
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  binController.deleteBin
);

module.exports = router;
