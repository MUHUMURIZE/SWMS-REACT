const express = require("express");
const router = express.Router();
const controller = require("../controllers/collectionController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const {
  authorizeCollectionManager,
  authorizeCollectionDeleter,
} = require("../middleware/authorization");
const { validateBody, validateId } = require("../middleware/validate");
const schemas = require("../validation/schemas");
const validatePagination = require("../middleware/pagination");

router.use(authenticateToken);
router.post("/", authorizeCollectionManager, validateBody(schemas.collectionCreate), asyncHandler(controller.create));
router.get("/", validatePagination, asyncHandler(controller.list));
router.get("/:id", validateId, asyncHandler(controller.get));
router.put("/:id/status", authorizeCollectionManager, validateId, validateBody(schemas.collectionStatus), asyncHandler(controller.updateStatus));
router.put("/:id", authorizeCollectionManager, validateId, validateBody(schemas.collectionUpdate), asyncHandler(controller.update));
router.delete("/:id", authorizeCollectionDeleter, validateId, asyncHandler(controller.remove));

module.exports = router;
