// routes/destination.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/destinationController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// ---------- Moderation (auth FIRST, then permission) ----------
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "destinations"),
  ctrl.listAll
);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "destinations"),
  ctrl.getOneModeration
);

router.post(
  "/moderation",
  auth,
  ensurePermission("create", "destinations"),
  ctrl.create
);

router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "destinations"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "destinations"),
  ctrl.update
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "destinations"),
  ctrl.updateStatus
);

router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "destinations"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "destinations"),
  ctrl.duplicate
);

// ---------- Public ----------
router.get("/", ctrl.listPublished); // ?page&limit&q&sort&filters
router.get("/:idOrSlug", ctrl.getBySlugOrId); // id or slug (published only)

module.exports = router;
