const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/becomeCreatorController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

/**
 * Public/Client (authenticated user)
 */
router.post("/apply", auth, ctrl.apply);

router.get("/me", auth, ctrl.getMine);

/**
 * Moderate/Admin
 */
router.get("/", auth, ensurePermission("read", "creatorrequest"), ctrl.list);

router.get(
  "/:id",
  auth,
  ensurePermission("read", "creatorrequest"),
  ctrl.getById
);

router.patch(
  "/:id/approve",
  auth,
  ensurePermission("update", "creatorrequest"),
  ctrl.accept
);

router.patch(
  "/:id/reject",
  auth,
  ensurePermission("update", "creatorrequest"),
  ctrl.reject
);

router.delete(
  "/:id",
  auth,
  ensurePermission("delete", "creatorrequest"),
  ctrl.remove
);

module.exports = router;
