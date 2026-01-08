// src/routes/slugs.js
const router = require("express").Router();
const { getSlugs } = require("../controllers/slugsController");
const auth = require("../middleware/auth");

// GET /apihome/slugs/:type?since=&page=&limit=&status=
router.get("/slugs/:type", auth, getSlugs);

module.exports = router;
