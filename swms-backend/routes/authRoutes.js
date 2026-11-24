const express = require("express");
const router = express.Router();
const controller = require("../controllers/authController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdmin } = require("../middleware/authorization");
const { validateBody } = require("../middleware/validate");
const schemas = require("../validation/schemas");
const { loginAttempts } = require("../middleware/loginRateLimiter");

router.post(
  "/register",
  authenticateToken,
  authorizeAdmin,
  validateBody(schemas.account),
  asyncHandler(async (req, res) => {
    const { role } = req.body;
    const required = {
      COMPANY_REPRESENTATIVE: ["companyId"],
      COLLECTOR: ["representativeId"],
      HOUSEHOLD: ["collectorId", "address"],
    }[role] || [];
    const missing = required.filter((field) => !req.body[field]);
    if (missing.length) {
      const AppError = require("../utils/AppError");
      throw new AppError(400, `Required for ${role}: ${missing.join(", ")}.`, "VALIDATION_ERROR");
    }
    return controller.register(req, res);
  })
);
router.post("/login", loginAttempts, validateBody(schemas.login), asyncHandler(controller.login));
router.post("/logout", authenticateToken, asyncHandler(controller.logout));
router.get("/profile", authenticateToken, asyncHandler(controller.profile));
router.put("/profile", authenticateToken, validateBody(schemas.profile), asyncHandler(controller.updateProfile));
router.put("/change-password", authenticateToken, validateBody(schemas.changePassword), asyncHandler(controller.changePassword));

module.exports = router;
