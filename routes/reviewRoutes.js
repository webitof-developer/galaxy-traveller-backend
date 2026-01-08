// routes/review.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/reviewController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Public (latest published singleton)
router.get("/", ctrl.getPublished);

// Moderation (auth FIRST, then permission: "review")
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "review"),
  ctrl.getSingletonModeration
);
router.patch(
  "/moderation",
  auth,
  ensurePermission("update", "review"),
  ctrl.updateSingleton
);
module.exports = router;
