// utils/syncRelations.js
const Blog = require("../models/Blog");
const Destination = require("../models/Destination");
const Month = require("../models/Month");
const Tour = require("../models/Tour");

// MASTER REVERSE MAP
const RELATION_MAP = {
  Blog: {
    destinations: { model: Destination, field: "blogs" },
    tours: { model: Tour, field: "blogs" },
    blogs: { model: Blog, field: "blogs" },
    tagMonths: { model: Month, field: "tagBlogs" },
  },

  Destination: {
    blogs: { model: Blog, field: "destinations" },
    tours: { model: Tour, field: "destinations" },
    tagMonths: { model: Month, field: "tagDestinations" },
  },

  Tour: {
    blogs: { model: Blog, field: "tours" },
    destinations: { model: Destination, field: "tours" },
    tours: { model: Tour, field: "tours" },
    tagMonths: { model: Month, field: "tagTours" },
  },

  Month: {
    tagBlogs: { model: Blog, field: "tagMonths" },
    tagDestinations: { model: Destination, field: "tagMonths" },
    tagTours: { model: Tour, field: "tagMonths" },
  },
};

async function syncRelations(doc, modelName) {
  if (!doc) return;
  const config = RELATION_MAP[modelName];
  if (!config) return;

  const docId = doc._id;

  for (const [localField, meta] of Object.entries(config)) {
    const ids = doc[localField];
    if (!ids) continue;

    // normalize to array
    const arr = Array.isArray(ids) ? ids : [ids];

    // --- ADD reverse relations
    await meta.model.updateMany(
      { _id: { $in: arr } },
      { $addToSet: { [meta.field]: docId } }
    );

    // --- REMOVE stale reverse relations (clean previous links)
    await meta.model.updateMany(
      { _id: { $nin: arr }, [meta.field]: docId },
      { $pull: { [meta.field]: docId } }
    );
  }
}

module.exports = syncRelations;
