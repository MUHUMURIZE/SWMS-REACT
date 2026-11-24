const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdmin, authorizeAdminOrRepresentative } = require("../middleware/authorization");
const reportController = require("../controllers/reportController");

router.use(authenticateToken);
router.get("/district", authorizeAdmin, asyncHandler(reportController.district));
router.get("/sector", authorizeAdmin, asyncHandler(reportController.sector));
router.get("/collector", authorizeAdminOrRepresentative, asyncHandler(reportController.collector));
router.get("/company", authorizeAdminOrRepresentative, asyncHandler(reportController.company));

module.exports = router;
