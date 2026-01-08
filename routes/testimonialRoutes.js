// routes/testimonial.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/testimonialController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// ---------- Moderation (auth FIRST, then permission) ----------
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "testimonial"),
  ctrl.listAll
);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "testimonial"),
  ctrl.getOneModeration
);

router.post(
  "/moderation",
  auth,
  ensurePermission("create", "testimonial"),
  ctrl.create
);

router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "testimonial"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "testimonial"),
  ctrl.update
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "testimonial"),
  ctrl.updateStatus
);

router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "testimonial"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "testimonial"),
  ctrl.duplicate
);

// ---------- Public ----------
router.get("/", auth, ctrl.listPublished); // ?page&limit&q&sort&filters
router.get("/:idOrSlug", auth, ctrl.getBySlugOrId); // id (published only)

module.exports = router;
