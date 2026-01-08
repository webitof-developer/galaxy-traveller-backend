const Relation = require("../models/Relation");
const { populateGraphRelations } = require("./relationHelper");

const RELATION_MAP = {
  Blog: {
    relations: {
      destinations: { type: "Destination", kind: "blog_destination" },

      tours: { type: "Tour", kind: "blog_tour" },
      blogs: { type: "Blog", kind: "blog_blog" },
      tagMonths: { type: "Month", kind: "blog_month" },
      categories: { type: "Category", kind: "blog_category" },
    },
  },

  Category: {
    relations: {
      blogs: { type: "Blog", kind: "blog_category" },
    },
  },

  Destination: {
    relations: {
      blogs: { type: "Blog", kind: "blog_destination" }, // SAME kind!
      tours: { type: "Tour", kind: "destination_tour" },
      tagMonths: { type: "Month", kind: "destination_month" },
    },
  },

  Month: {
    relations: {
      tagDestinations: { type: "Destination", kind: "month_destination" },
      tagTours: { type: "Tour", kind: "tour_month" },

      tagBlogs: { type: "Blog", kind: "blog_month" },
    },
  },

  Tour: {
    relations: {
      destinations: { type: "Destination", kind: "destination_tour" },

      blogs: { type: "Blog", kind: "blog_tour" },
      tagMonths: { type: "Month", kind: "month_tour" },
      tours: { type: "Tour", kind: "tour_tour" },
    },
  },
};

async function getRelationFields(modelName, nodeId, expand = false) {
  const config = RELATION_MAP[modelName];
  if (!config) return {};

  const output = {};

  for (const [field, relCfg] of Object.entries(config.relations)) {
    const { kind, type } = relCfg;

    // Fetch relations
    const relations = await Relation.find({
      kind,
      $or: [{ "from.id": nodeId }, { "to.id": nodeId }],
    }).lean();

    console.log(relations);

    const ids = relations.map((r) => {
      const from = String(r.from.id);
      const to = String(r.to.id);
      const target = String(nodeId);
      return from === target ? to : from;
    });

    // FAST MODE (default)
    if (!expand) {
      output[field] = ids;
      continue;
    }

    // EXPANDED MODE (populate actual documents)
    const Model = require(`../models/${type}`);
    output[field] = await Model.find({ _id: { $in: ids } })
      .select("name title slug img profileImg") // choose what's needed
      .lean();
  }

  return output;
}

module.exports = {
  RELATION_MAP,
  getRelationFields,
};
