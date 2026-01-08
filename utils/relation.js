const Relation = require("../models/Relation");

/**
 * Add relation (1 edge, unidirectional storage → undirected semantics)
 */
exports.addRelation = async (kind, fromId, fromType, toId, toType) => {
  await Relation.updateOne(
    {
      kind,
      "from.id": fromId,
      "to.id": toId,
    },
    {
      $setOnInsert: {
        kind,
        from: { id: fromId, type: fromType },
        to: { id: toId, type: toType },
      },
    },
    { upsert: true }
  );
};

/**
 * Remove relation IN BOTH DIRECTIONS
 */
exports.removeRelation = async (kind, fromId, toId) => {
  await Relation.deleteOne({
    kind,
    $or: [
      { "from.id": fromId, "to.id": toId },
      { "from.id": toId, "to.id": fromId },
    ],
  });
};

/**
 * Get all relations connected to a node (all kinds)
 */
exports.getRelated = async (id) => {
  return Relation.find({
    $or: [{ "from.id": id }, { "to.id": id }],
  }).lean();
};

/**
 * Get relations by kind
 */
exports.getRelatedByKind = async (kind, id) => {
  return Relation.find({
    kind,
    $or: [{ "from.id": id }, { "to.id": id }],
  }).lean();
};

/**
 * Build simple graph: { type: [ids] }
 */
exports.getGraphForNode = async (id) => {
  const relations = await exports.getRelated(id);
  const graph = {};

  for (const r of relations) {
    const isFrom = String(r.from.id) === String(id);
    const ref = isFrom ? r.to : r.from;

    if (!graph[ref.type]) graph[ref.type] = [];
    graph[ref.type].push(ref.id);
  }

  return graph;
};
