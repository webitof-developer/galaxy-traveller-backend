const router = require("express").Router();
const ctrl = require("../controllers/smtpSettingController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

// Admin only
router.get("/", auth, ctrl.get);
router.put("/", auth, ctrl.update);
router.post("/send-test-email", auth, ctrl.sendTestEmail);

module.exports = router;
