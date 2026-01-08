const router = require("express").Router();
const ctrl = require("../controllers/emailMessageController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

router.get("/", auth, ctrl.get);
router.put("/", auth, ctrl.update);

module.exports = router;
