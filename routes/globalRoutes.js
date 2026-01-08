// routes/global.routes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/globalController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Public (published)
router.get("/", ctrl.getPublished);

// Moderation read/create
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "site_global"),
  ctrl.getSingletonModeration
);

// Moderation update
router.patch(
  "/moderation",
  auth,
  ensurePermission("update", "site_global"),
  ctrl.updateSingleton
);

module.exports = router;
