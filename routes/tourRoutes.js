// routes/tour.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/tourController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Moderation (prefix only here)
router.get("/moderation", auth, ensurePermission("read", "tour"), ctrl.listAll);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "tour"),
  ctrl.getOneModeration
);
router.post(
  "/moderation",
  auth,
  ensurePermission("create", "tour"),
  ctrl.create
);

router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "tour"),
  ctrl.update
);
router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "tour"),
  ctrl.updateStatus
);
router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "tour"),
  ctrl.remove
);
// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "tour"),
  ctrl.duplicate
);

// Public (no prefix)
router.get("/", ctrl.listPublished); // ?page&limit&q&sort&filters (locked to published)
router.get("/search-home", ctrl.searchHome);
router.get("/search", ctrl.searchTours);
router.get("/:idOrSlug", ctrl.getBySlugOrId); // id or slug (published only)
router.post("/:idOrSlug/reviews", ctrl.addTestimonialPublic);

module.exports = router;
