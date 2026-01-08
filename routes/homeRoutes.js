const express = require("express");
const router = express.Router();
const homeCtrl = require("../controllers/homeController");
const auth = require("../middleware/auth");

// GET /api/home
router.get("/home", homeCtrl.getHomeData);
router.get("/search/:query", homeCtrl.searchHomeData);
router.get("/main", auth, homeCtrl.getMainData);
module.exports = router;
