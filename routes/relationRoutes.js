const express = require("express");
const router = express.Router();

const RelationController = require("../controllers/relationController");

// ADD relation (unidirectional)
router.post("/add", RelationController.add);

// REMOVE relation
router.post("/remove", RelationController.remove);

// GET relations for a specific kind → /api/relations/:kind/:id
router.get("/:kind/:id", RelationController.listByKind);

// GET all related nodes for one node → /api/relations/node/:type/:id
router.get("/node/:type/:id", RelationController.getNodeRelations);

// GRAPH: one-hop expansion → /api/relations/graph/:id
router.get("/graph/:id", RelationController.getGraph);

module.exports = router;
