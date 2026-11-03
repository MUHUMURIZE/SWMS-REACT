const express = require("express");
const router = express.Router();
const controller = require("../controllers/companyController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdmin } = require("../middleware/authorization");
const { validateBody, validateId } = require("../middleware/validate");
const { company } = require("../validation/schemas");

router.use(authenticateToken, authorizeAdmin);
router.post("/", validateBody(company), asyncHandler(controller.create));
router.get("/", asyncHandler(controller.list));
router.get("/:id", validateId, asyncHandler(controller.get));
router.put("/:id", validateId, validateBody(company), asyncHandler(controller.update));
router.delete("/:id", validateId, asyncHandler(controller.remove));

module.exports = router;
