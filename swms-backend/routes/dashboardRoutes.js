const express = require("express");
const router = express.Router();
const controller = require("../controllers/dashboardController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const {
  authorizeAdmin,
  authorizeRepresentative,
  authorizeCollector,
  authorizeHousehold,
} = require("../middleware/authorization");

router.use(authenticateToken);
router.get("/admin", authorizeAdmin, asyncHandler(controller.admin));
router.get("/company", authorizeRepresentative, asyncHandler(controller.company));
router.get("/collector", authorizeCollector, asyncHandler(controller.collector));
router.get("/household", authorizeHousehold, asyncHandler(controller.household));

module.exports = router;
