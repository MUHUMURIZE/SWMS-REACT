const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const validatePagination = require("../middleware/pagination");
const schedulingController = require("../controllers/schedulingController");

router.use(authenticateToken);
router.get("/upcoming", validatePagination, asyncHandler(schedulingController.upcoming));
router.get("/missed", validatePagination, asyncHandler(schedulingController.missed));
router.get("/overdue", validatePagination, asyncHandler(schedulingController.overdue));
router.get("/rescheduled", validatePagination, asyncHandler(schedulingController.rescheduled));

module.exports = router;
