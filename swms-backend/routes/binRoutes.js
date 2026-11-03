const express = require("express");
const router = express.Router();
const controller = require("../controllers/binController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeBinReader, authorizeBinManager } = require("../middleware/authorization");
const { validateBody, validateId } = require("../middleware/validate");
const schemas = require("../validation/schemas");

router.post("/", authenticateToken, authorizeBinManager, validateBody(schemas.binCreate), asyncHandler(controller.create));
router.get("/", authenticateToken, authorizeBinReader, asyncHandler(controller.list));
router.get("/full", authenticateToken, authorizeBinReader, asyncHandler(controller.listFull));
router.get("/:id", authenticateToken, authorizeBinReader, validateId, asyncHandler(controller.get));
router.put("/:id", authenticateToken, authorizeBinManager, validateId, validateBody(schemas.binUpdate), asyncHandler(controller.update));
router.delete("/:id", authenticateToken, authorizeBinManager, validateId, asyncHandler(controller.remove));
router.put("/:id/progress", authenticateToken, authorizeBinManager, validateId, validateBody(schemas.binProgress), asyncHandler(controller.updateProgress));
router.put("/:id/empty", authenticateToken, authorizeBinManager, validateId, asyncHandler(controller.empty));

module.exports = router;
