// routes/month.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/monthController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// ---------- Moderation (auth FIRST, then permission) ----------
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "month"),
  ctrl.listAll
);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "month"),
  ctrl.getOneModeration
);

router.post(
  "/moderation",
  auth,
  ensurePermission("create", "month"),
  ctrl.create
);

router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "month"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "month"),
  ctrl.update
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "month"),
  ctrl.updateStatus
);

router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "month"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "month"),
  ctrl.duplicate
);

// ---------- Public ----------
router.get("/", ctrl.listPublished); // ?page&limit&q&sort&filters
router.get("/:idOrSlug", ctrl.getBySlugOrId); // id or monthTag (published only)

module.exports = router;
