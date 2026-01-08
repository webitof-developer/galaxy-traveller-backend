// routes/flyer.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/flyerController");
const { ensurePermission } = require("../middleware/ensurePermission");
const auth = require("../middleware/auth");

// ---------- Moderation (prefixed only here) ----------
// Read (list all + get one)
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "flyers"),
  ctrl.listAll
);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "flyers"),
  ctrl.getOne
);

// Create
router.post(
  "/moderation",
  auth,
  ensurePermission("create", "flyers"),
  ctrl.create
);

// Update (full/partial by id)
router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "flyers"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "flyers"),
  ctrl.update
);

// Delete
router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "flyers"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "flyers"),
  ctrl.duplicate
);

// ---------- Public (no prefix) ----------
router.get("/", ctrl.listPublished); // ?page&limit&q&sort
router.get("/:id", ctrl.getOne);

module.exports = router;
