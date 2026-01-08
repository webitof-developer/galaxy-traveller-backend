// routes/roles.js
const express = require("express");
const { ensurePermission } = require("../middleware/ensurePermission");
const auth = require("../middleware/auth");
const rolesController = require("../controllers/roles.controller");

const router = express.Router();

// List roles (optionally with user counts)
router.get("/", auth, rolesController.list);

// Get single role
router.get("/:id", auth, rolesController.getOne);

// Create role
router.post(
  "/",
  auth,
  ensurePermission("create", "roles"),
  rolesController.create
);

// Update role
router.put(
  "/:id",
  auth,
  ensurePermission("update", "roles"),
  rolesController.update
);

// Delete role
router.delete(
  "/:id",
  auth,
  ensurePermission("delete", "roles"),
  rolesController.remove
);

// Duplicate role
router.post(
  "/:id/duplicate",
  auth,
  ensurePermission("create", "roles"),
  rolesController.duplicate
);

module.exports = router;
