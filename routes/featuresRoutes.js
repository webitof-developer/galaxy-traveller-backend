// routes/featured.routes.js (singleton)
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/featuresController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Public (single published doc)
router.get("/", ctrl.getPublished);

// Moderation: single updater (auth FIRST, then permission)
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "site_features"),
  ctrl.getSingletonModeration
);
router.patch(
  "/moderation",
  auth,
  ensurePermission("update", "site_features"),
  ctrl.updateSingleton
);

module.exports = router;
