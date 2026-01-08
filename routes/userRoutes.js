// routes/user.routes.js
const express = require("express");
const { ensurePermission } = require("../middleware/ensurePermission");
const auth = require("../middleware/auth");
const userController = require("../controllers/user.controller");

const router = express.Router();

// List all users
router.get("/", auth, userController.list);
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "users"),
  userController.list
);
// Get current logged-in user
router.get("/me", auth, userController.me);
// Get user by ID
router.get("/:id", auth, userController.get);
router.get("/profile/:id", auth, userController.profile);

// Create new user (admin only)
router.post(
  "/",
  auth,
  ensurePermission("create", "users"),
  userController.create
);

// Update user (admin or own scope)
router.put(
  "/:id",
  auth,
  ensurePermission("update", "users"),
  userController.update
);
router.patch("/:id", auth, userController.update);

// Delete user (admin or own scope)
router.delete(
  "/:id",
  auth,
  ensurePermission("delete", "users"),
  userController.remove
);

module.exports = router;
