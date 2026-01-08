// utils/exporter.js
// Export data from all models, or a specific model.
// Usage examples are at the bottom of this file.

const mongoose = require("mongoose");

// ---- models map (same keys you already use in ensurePermission) ----
const Blog = require("../models/Blog");
const Category = require("../models/Category");
const Destination = require("../models/Destination");
const DestinationList = require("../models/DestinationList"); // aka destinationList

const Features = require("../models/Features");
const HeroSlide = require("../models/HeroSlide");
const Lead = require("../models/Lead");
const Month = require("../models/Month");
const Review = require("../models/Review"); // singleton review list, if applicable
const Testimonial = require("../models/Testimonial");
const Tour = require("../models/Tour");
const User = require("../models/User");
const Role = require("../models/Role");

const MODELS = {
  blog: Blog,
  category: Category,
  destination: Destination,
  lead: Lead,
  month: Month,
  testimonial: Testimonial,
  tour: Tour,
  users: User,
  roles: Role,
  destinationList: DestinationList,
  features: Features,
  heroSlide: HeroSlide,
  review: Review,
};

// ---- helpers ----
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);
const toObjectId = (v) =>
  isObjectId(v) ? mongoose.Types.ObjectId.createFromHexString(String(v)) : null;

function buildQuery(opts = {}) {
  const {
    status, // "published" | "draft" | "rejected"
    from,
    to, // ISO date strings (createdAt range)
    ids, // array of _id strings
    filter = {}, // extra raw mongo filter
  } = opts;

  const q = { ...filter };

  if (status) q.status = status;

  if (Array.isArray(ids) && ids.length) {
    const arr = ids.map(toObjectId).filter(Boolean);
    if (arr.length) q._id = { $in: arr };
  }

  if (from || to) {
    const r = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) r.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) r.$lte = d;
    }
    if (Object.keys(r).length) q.createdAt = r;
  }

  return q;
}

function normalizeSelect(select) {
  if (!select) return undefined;
  if (Array.isArray(select)) return select.join(" ");
  if (typeof select === "string") return select;
  // object form {field:1} is accepted as-is
  return select;
}

/**
 * Export ONE model.
 * @param {string} modelKey - key in MODELS (case-insensitive)
 * @param {object} options
 *   - status, from, to, ids[], filter: see buildQuery
 *   - select: string | string[] | object
 *   - sort: string (e.g. "-createdAt,_id")
 *   - limit: number
 *   - lean: boolean (default true)
 *   - hydrate: boolean (default false) -> apply schema transforms by hydrating then toObject()
 */
async function exportModel(modelKey, options = {}) {
  const key = String(modelKey || "").toLowerCase();
  const Model = MODELS[key];
  if (!Model) throw new Error(`Unknown model: ${modelKey}`);

  const {
    select,
    sort = "-createdAt,-_id",
    limit,
    lean = true,
    hydrate = false,
  } = options;

  const q = buildQuery(options);
  const sel = normalizeSelect(select);

  let query = Model.find(q);
  if (sel) query = query.select(sel);
  if (sort)
    query = query.sort(
      sort.split(",").reduce((acc, s) => {
        s = s.trim();
        if (!s) return acc;
        if (s.startsWith("-")) acc[s.slice(1)] = -1;
        else acc[s] = 1;
        return acc;
      }, {})
    );
  if (limit && Number(limit) > 0) query = query.limit(Number(limit));

  if (lean && !hydrate) {
    const docs = await query.lean();
    return docs;
  }

  // Apply schema transforms (toObject with virtuals/transform)
  const docs = await query.exec();
  return docs.map((d) => d.toObject());
}

/**
 * Export ALL models.
 * @param {object} options
 *   - apply same options as exportModel to every model
 *   - perModel: { [modelKey]: options } to override per model
 *   - only: string[] limit to subset
 *   - exclude: string[] skip some
 */
async function exportAll(options = {}) {
  const { perModel = {}, only, exclude = [], ...common } = options;

  const keys = Object.keys(MODELS)
    .filter((k) => (only ? only.map(String.toString).includes(k) : true))
    .filter((k) => !exclude.includes(k));

  const out = {};
  for (const key of keys) {
    const opts = { ...common, ...(perModel[key] || {}) };
    out[key] = await exportModel(key, opts);
  }
  return out;
}

module.exports = {
  MODELS,
  exportModel,
  exportAll,
};
