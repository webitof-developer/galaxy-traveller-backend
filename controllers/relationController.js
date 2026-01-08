const Relation = require("../models/Relation");
const {
  addRelation,
  removeRelation,
  getRelated,
  getRelatedByKind,
  getGraphForNode,
} = require("../utils/relation");
const { asyncHandler } = require("../utils/respond");

// Dynamically import models
const models = {
  blog: require("../models/Blog"),
  blogs: require("../models/Blog"),
  destinations: require("../models/Destination"),
  tours: require("../models/Tour"),
  destination: require("../models/Destination"),
  tour: require("../models/Tour"),
  month: require("../models/Month"),
  category: require("../models/Category"),
};

// Validate model type
function getModel(type) {
  const t = type?.toLowerCase();
  if (!models[t]) throw new Error(`Invalid type: ${type}`);
  return models[t];
}

/**
 * POST /api/relations/add
 * body: { kind, fromId, fromType, toId, toType }
 */
exports.add = asyncHandler(async (req, res) => {
  console.log("ADD RELATION BODY:", req.body);
  const { kind, fromId, fromType, toId, toType } = req.body;

  if (!kind || !fromId || !fromType || !toId || !toType) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Validate existence of both nodes
  const ModelFrom = getModel(fromType);
  const ModelTo = getModel(toType);

  const fromDoc = await ModelFrom.findById(fromId);
  const toDoc = await ModelTo.findById(toId);

  if (!fromDoc || !toDoc) {
    return res.status(404).json({ message: "One or both items not found." });
  }

  await addRelation(kind, fromId, fromType, toId, toType);

  return res.json({
    message: "Relation added successfully.",
    relation: { kind, fromId, fromType, toId, toType },
  });
});

/**
 * POST /api/relations/remove
 * body: { kind, fromId, toId }
 */
exports.remove = asyncHandler(async (req, res) => {
  const { kind, fromId, toId } = req.body;

  if (!kind || !fromId || !toId) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  await removeRelation(kind, fromId, toId);

  return res.json({
    message: "Relation removed successfully.",
  });
});

/**
 * GET /api/relations/:kind/:id
 */
exports.listByKind = asyncHandler(async (req, res) => {
  const { kind, id } = req.params;

  const relations = await getRelatedByKind(kind, id);

  return res.json({
    count: relations.length,
    relations,
  });
});

/**
 * GET /api/relations/node/:type/:id
 * Return full objects of all related entities
 */
exports.getNodeRelations = asyncHandler(async (req, res) => {
  const { id, type } = req.params;

  const Model = getModel(type);

  // Ensure node exists
  const node = await Model.findById(id).lean();
  if (!node) return res.status(404).json({ message: "Node not found." });

  const relations = await getRelated(id);

  // Group related nodes
  const grouped = {};

  for (const r of relations) {
    const isFrom = String(r.from.id) === id;
    const ref = isFrom ? r.to : r.from;

    if (!grouped[ref.type]) grouped[ref.type] = [];
    grouped[ref.type].push(ref.id);
  }

  // Fetch full objects
  const populated = {};

  for (const [t, ids] of Object.entries(grouped)) {
    const M = getModel(t);
    populated[t] = await M.find({ _id: { $in: ids } }).lean();
  }

  return res.json({
    node,
    relations: populated,
  });
});

/**
 * GET /api/relations/graph/:id
 * Expand all related nodes (full graph for one hop)
 */
exports.getGraph = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const graph = await getGraphForNode(id);

  const final = {};

  for (const [type, ids] of Object.entries(graph)) {
    const M = getModel(type);
    final[type] = await M.find({ _id: { $in: ids } }).lean();
  }

  return res.json({
    count: Object.keys(final).length,
    graph: final,
  });
});
