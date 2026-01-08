// routes/listDestination.routes.js (simplified)
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/destinationListController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Public
router.get("/", ctrl.getPublished);

// Moderation: single updater (auth FIRST, then permission)
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "site_destinationslist"),
  ctrl.getSingletonModeration
);
router.patch(
  "/moderation",
  auth,
  ensurePermission("update", "site_destinationslist"),
  ctrl.updateSingleton
);

module.exports = router;
