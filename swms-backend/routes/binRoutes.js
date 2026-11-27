const express = require("express");
const router = express.Router();
const controller = require("../controllers/binController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeBinReader, authorizeBinManager, authorizeHouseholdManager } = require("../middleware/authorization");
const { validateBody, validateId } = require("../middleware/validate");
const schemas = require("../validation/schemas");
const validatePagination = require("../middleware/pagination");

router.post("/", authenticateToken, authorizeBinManager, validateBody(schemas.binCreate), asyncHandler(controller.create));
router.get("/", authenticateToken, authorizeBinReader, validatePagination, asyncHandler(controller.list));
router.get("/full", authenticateToken, authorizeBinReader, validatePagination, asyncHandler(controller.listFull));
router.get("/:id", authenticateToken, authorizeBinReader, validateId, asyncHandler(controller.get));
router.put("/:id", authenticateToken, authorizeBinManager, validateId, validateBody(schemas.binUpdate), asyncHandler(controller.update));
router.delete("/:id", authenticateToken, authorizeBinManager, validateId, asyncHandler(controller.remove));
router.put("/:id/location", authenticateToken, authorizeHouseholdManager, validateId, validateBody(schemas.binLocation), asyncHandler(controller.updateLocation));
router.put("/:id/progress", authenticateToken, authorizeBinManager, validateId, validateBody(schemas.binProgress), asyncHandler(controller.updateProgress));
router.put("/:id/empty", authenticateToken, authorizeBinManager, validateId, asyncHandler(controller.empty));

module.exports = router;
