// routes/hero.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/heroSlideController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Public
router.get("/", ctrl.getPublished);

// Moderation
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "site_heroslides"),
  ctrl.getSingletonModeration
);

router.patch(
  "/moderation",
  auth,
  ensurePermission("update", "site_heroslides"),
  ctrl.updateSingleton
);

module.exports = router;
