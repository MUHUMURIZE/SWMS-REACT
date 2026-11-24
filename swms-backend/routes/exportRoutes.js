const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeExportReader } = require("../middleware/authorization");
const { exportData } = require("../controllers/exportController");

router.use(authenticateToken);
router.get("/:resource/:format",
  authorizeExportReader,
  asyncHandler(exportData)
);

module.exports = router;
