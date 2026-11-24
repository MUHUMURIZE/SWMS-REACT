const express = require("express");
const router = express.Router();
const controller = require("../controllers/representativeController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdmin } = require("../middleware/authorization");
const { validateBody, validateId } = require("../middleware/validate");
const schemas = require("../validation/schemas");
const validatePagination = require("../middleware/pagination");

router.use(authenticateToken, authorizeAdmin);
router.post("/", validateBody(schemas.representativeCreate), asyncHandler(controller.create));
router.get("/", validatePagination, asyncHandler(controller.list));
router.get("/:id", validateId, asyncHandler(controller.get));
router.put("/:id", validateId, validateBody(schemas.representativeUpdate), asyncHandler(controller.update));
router.delete("/:id", validateId, asyncHandler(controller.remove));

module.exports = router;
