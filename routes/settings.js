const express = require("express");
const ctrl = require("../controllers/settingController");
const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

const router = express.Router();

router.get("/", ctrl.get);
router.put("/:key", auth, ctrl.update);

module.exports = router;
