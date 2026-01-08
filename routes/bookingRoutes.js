// routes/booking.routes.js
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/bookingController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Admin
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "booking"),
  ctrl.listAll
);
router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "booking"),
  ctrl.getModeratedOne
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "booking"),
  ctrl.updateStatus
);
router.post(
  "/moderation",
  auth,
  ensurePermission("create", "booking"),
  ctrl.create
);

router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "booking"),
  ctrl.update
);
// Admin delete (optional stricter rule)
router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "booking"),
  ctrl.remove
);

// Public / User
router.post("/", auth, ctrl.create);
router.get("/my", auth, ctrl.listMine);
router.patch("/:id/cancel", auth, ctrl.cancelBooking);
router.get("/:id", auth, ctrl.getOne);

module.exports = router;
