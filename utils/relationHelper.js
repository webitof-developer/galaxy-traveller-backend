const { getRelated } = require("./relation");

const modelMap = {
  blog: require("../models/Blog"),
  blogs: require("../models/Blog"),
  destination: require("../models/Destination"),
  destinations: require("../models/Destination"),
  tour: require("../models/Tour"),
  tours: require("../models/Tour"),
  month: require("../models/Month"),
  months: require("../models/Month"),
  category: require("../models/Category"),
};

function getModel(type) {
  const key = String(type || "").toLowerCase();
  if (!modelMap[key]) throw new Error(`Invalid model type "${type}"`);
  return modelMap[key];
}

/**
 * Populate full objects for all related nodes
 */
async function populateGraphRelations(id) {
  const edges = await getRelated(id);

  const byType = {};

  for (const e of edges) {
    const isFrom = String(e.from.id) === String(id);
    const node = isFrom ? e.to : e.from;

    if (!byType[node.type]) byType[node.type] = [];
    byType[node.type].push(node.id);
  }

  const result = {};
  for (const [type, ids] of Object.entries(byType)) {
    const Model = getModel(type);
    result[type] = await Model.find({ _id: { $in: ids } }).lean();
  }

  return result;
}

module.exports = {
  populateGraphRelations,
  modelMap,
  getModel,
};
