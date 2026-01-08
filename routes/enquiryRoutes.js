const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/enquireController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// ---------- Public (authenticated users can send enquiries) ----------
router.post("/", ctrl.create);
router.post("/moderation", auth, ctrl.create);

// ---------- Moderation (admin/staff) ----------
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "enquiries"),
  ctrl.listAll
);

router.get(
  "/moderation/:id",
  auth,
  ensurePermission("read", "enquiries"),
  ctrl.getOne
);

router.patch(
  "/moderation/:id",
  auth,
  ensurePermission("update", "enquiries"),
  ctrl.update
);

router.patch(
  "/moderation/:id/status",
  auth,
  ensurePermission("update", "enquiries"),
  ctrl.updateStatus
);

router.delete(
  "/moderation/:id",
  auth,
  ensurePermission("delete", "enquiries"),
  ctrl.remove
);

// Duplicate
router.post(
  "/moderation/:id/duplicate",
  auth,
  ensurePermission("create", "enquiries"),
  ctrl.duplicate
);

router.post("/send-otp", ctrl.sendOtp);
router.post("/verify-otp", ctrl.verifyOtpAndCreate);

module.exports = router;
