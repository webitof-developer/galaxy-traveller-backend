// routes/blog.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/blogController");
const { ensurePermission } = require("../middleware/ensurePermission");
const auth = require("../middleware/auth");

// ---------- Moderation (prefixed only here) ----------
// Read (list all + get one)
router.get("/moderation", auth, ensurePermission("read", "blog"), ctrl.listAll);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "blog"),
  ctrl.getOneModeration
);

// Create
router.post(
  "/moderation",
  auth,
  ensurePermission("create", "blog"),
  ctrl.create
);

// Update (full/partial by id)
router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "blog"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "blog"),
  ctrl.update
);

// Status-only update
router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "blog"),
  ctrl.updateStatus
);

// Delete
router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "blog"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "blog"),
  ctrl.duplicate
);

// ---------- Public (no prefix) ----------
router.get("/", ctrl.listPublished); // ?page&limit&q&sort (locked to status=published)
router.get("/:idOrSlug", ctrl.getBySlugOrId);

module.exports = router;
