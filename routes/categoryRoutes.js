// routes/category.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/categoryController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// ---------- Moderation (auth FIRST, then permission) ----------
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "categories"),
  ctrl.listAll
);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "categories"),
  ctrl.getOneModeration
);

router.post(
  "/moderation",
  auth,
  ensurePermission("create", "categories"),
  ctrl.create
);

router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "categories"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "categories"),
  ctrl.update
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "categories"),
  ctrl.updateStatus
);

router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "categories"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "categories"),
  ctrl.duplicate
);

// ---------- Public ----------
router.get("/", ctrl.listPublished); // ?page&limit&q&status(ignored; forced to published)&sort
router.get("/:idOrSlug", ctrl.getBySlugOrId); // id or tag

module.exports = router;
