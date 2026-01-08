// routes/lead.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/leadController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// ---------- Moderation (auth FIRST, then permission) ----------
router.get("/moderation", auth, ensurePermission("read", "lead"), ctrl.listAll);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "lead"),
  ctrl.getOneModeration
);

router.post(
  "/moderation",
  auth,
  ensurePermission("create", "lead"),
  ctrl.create
);

router.put(
  "/moderation/:id",
  auth,
  ensurePermission("update", "lead"),
  ctrl.update
);
router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "lead"),
  ctrl.update
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "lead"),
  ctrl.updateStatus
);

router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "lead"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "lead"),
  ctrl.duplicate
);

// ---------- Public ----------
router.get("/", auth, ctrl.listPublished); // ?page&limit&q&sort&filters
router.get("/:idOrSlug", auth, ctrl.getBySlugOrId); // ObjectId only for this model
router.post("/", ctrl.create);

module.exports = router;
