const router = require("express").Router();
const ctrl = require("../controllers/policyController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// PUBLIC
router.get("/", ctrl.getPublicPolicy);

// ADMIN
router.get(
  "/moderation",
  auth,
  ensurePermission("read", "policy"),
  ctrl.getAdminPolicy
);
router.put(
  "/moderation",
  auth,
  ensurePermission("update", "policy"),
  ctrl.updateAdminPolicy
);

module.exports = router;
