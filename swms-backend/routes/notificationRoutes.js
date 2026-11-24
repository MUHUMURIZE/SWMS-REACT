const express = require("express");
const router = express.Router();
const controller = require("../controllers/notificationController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { validateId } = require("../middleware/validate");
const validatePagination = require("../middleware/pagination");

router.use(authenticateToken);
router.get("/", validatePagination, asyncHandler(controller.list));
router.put("/:id/read", validateId, asyncHandler(controller.markRead));

module.exports = router;
