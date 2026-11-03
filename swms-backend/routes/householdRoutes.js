const express = require("express");
const router = express.Router();
const controller = require("../controllers/householdController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const {
  authorizeHouseholdManager,
  authorizeHouseholdReader,
  authorizeHousehold,
} = require("../middleware/authorization");
const { validateBody, validateId, requireRoleFields } = require("../middleware/validate");
const schemas = require("../validation/schemas");

router.post(
  "/",
  authenticateToken,
  authorizeHouseholdManager,
  validateBody(schemas.householdCreate),
  requireRoleFields({ ADMIN: ["collectorId"], COMPANY_REPRESENTATIVE: ["collectorId"] }),
  asyncHandler(controller.create)
);
router.get("/", authenticateToken, authorizeHouseholdReader, asyncHandler(controller.list));
router.get("/me", authenticateToken, authorizeHousehold, asyncHandler(controller.me));
router.put(
  "/me",
  authenticateToken,
  authorizeHousehold,
  validateBody(schemas.householdSelf),
  asyncHandler(controller.updateMe)
);
router.get("/:id", authenticateToken, authorizeHouseholdReader, validateId, asyncHandler(controller.get));
router.put(
  "/:id",
  authenticateToken,
  authorizeHouseholdManager,
  validateId,
  validateBody(schemas.householdUpdate),
  asyncHandler(controller.update)
);
router.delete("/:id", authenticateToken, authorizeHouseholdManager, validateId, asyncHandler(controller.remove));
module.exports = router;
