const express = require("express");
const router = express.Router();
const controller = require("../controllers/collectorController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdminOrRepresentative } = require("../middleware/authorization");
const { validateBody, validateId, requireRoleFields } = require("../middleware/validate");
const schemas = require("../validation/schemas");
const validatePagination = require("../middleware/pagination");

router.use(authenticateToken, authorizeAdminOrRepresentative);
router.post(
  "/",
  validateBody(schemas.collectorCreate),
  requireRoleFields({ ADMIN: ["representativeId"] }),
  asyncHandler(controller.create)
);
router.get("/", validatePagination, asyncHandler(controller.list));
router.get("/:id", validateId, asyncHandler(controller.get));
router.put("/:id", validateId, validateBody(schemas.collectorUpdate), asyncHandler(controller.update));
router.delete("/:id", validateId, asyncHandler(controller.remove));

module.exports = router;
