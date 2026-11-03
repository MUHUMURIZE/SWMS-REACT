const express = require("express");
const router = express.Router();
const householdController = require("../controllers/householdController");
const collectionController = require("../controllers/collectionController");
const notificationController = require("../controllers/notificationController");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeHousehold } = require("../middleware/authorization");
const binController = require("../controllers/binController");
const { validateBody } = require("../middleware/validate");
const { householdSelf } = require("../validation/schemas");

router.get("/me", authenticateToken, authorizeHousehold, asyncHandler(householdController.me));
router.put("/me", authenticateToken, authorizeHousehold, validateBody(householdSelf), asyncHandler(householdController.updateMe));
router.get("/my-progress", authenticateToken, authorizeHousehold, asyncHandler(collectionController.myProgress));
router.get("/my-notifications", authenticateToken, authorizeHousehold, asyncHandler(notificationController.list));
router.get("/my-bin", authenticateToken, authorizeHousehold, asyncHandler(binController.myBin));

module.exports = router;
