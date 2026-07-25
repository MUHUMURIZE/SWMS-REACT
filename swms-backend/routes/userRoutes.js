const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// Register new users
// Admin can register anyone
// Company reps can register collectors + households
// Collectors can register households
router.post(
  "/register",
  authenticateToken,
  authorizeRoles("admin", "company_representative", "collector"),
  userController.registerUser
);

// Login (public)
router.post("/login", userController.loginUser);

// Get all users
// Admin only
router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  userController.getUsers
);

// Get user by ID
// All roles can access, but controller enforces ownership rules
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("admin", "company_representative", "collector", "household"),
  userController.getUserById
);

// Update user
// Admin can update anyone
// Company reps can update their collectors + households
// Collectors can update their households
// Households can update themselves
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin", "company_representative", "collector", "household"),
  userController.updateUser
);

// Delete user
// Admin can delete anyone
// Company reps can delete their collectors + households
// Collectors can delete their households
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("admin", "company_representative", "collector"),
  userController.deleteUser
);

module.exports = router;
