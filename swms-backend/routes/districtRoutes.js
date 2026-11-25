const express = require("express");
const router = express.Router();
const controller = require("../controllers/districtController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdmin } = require("../middleware/authorization");
const { validateBody, validateId } = require("../middleware/validate");
const { district, districtAgreement, districtAgreementTransition } = require("../validation/schemas");
const validatePagination = require("../middleware/pagination");

router.use(authenticateToken, authorizeAdmin);
router.get("/agreements", validatePagination, asyncHandler(controller.listAgreements));
router.post("/agreements/:id/status", validateId, validateBody(districtAgreementTransition), asyncHandler(controller.transitionAgreement));
router.post("/", validateBody(district), asyncHandler(controller.create));
router.get("/", validatePagination, asyncHandler(controller.list));
router.get("/:id/agreements", validateId, validatePagination, asyncHandler(controller.listAgreements));
router.post("/:id/agreements", validateId, validateBody(districtAgreement), asyncHandler(controller.createAgreement));
router.get("/:id", validateId, asyncHandler(controller.get));

module.exports = router;
