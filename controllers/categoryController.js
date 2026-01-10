// controllers/category.controller.js
const mongoose = require("mongoose");
const Category = require("../models/Category");
const cache = require("../lib/cache/cache");

const {
  ok,
  created,
  notFound,
  fail,
  asyncHandler,
} = require("../utils/respond");

const {
  isObjectId,
  coerceId,
  latestSort,
  parsePagination,
  buildSearch,
  csvObjectIds,
  applyDateRange,
} = require("../utils/query");

// ⭐ NEW universal relation graph helper
const { populateGraphRelations } = require("../utils/relationHelper");
const { getRelationFields, RELATION_MAP } = require("../utils/relationMapper");
const { addRelation, removeRelation } = require("../utils/relation");
const LIST_TTL = 300; // lists: 2–5 minutes
const DETAIL_TTL = 900; // detail: 10–30 minutes
const invalidateCategoryCaches = (slug) => {
  cache.del("categories:list:all");
  if (slug) cache.del(`categories:slug:${slug}`);
};

// ---------------- Filters ----------------
const buildFilters = (req) => {
  const f = {};

  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  if (req.query.blogs) {
    const arr = String(req.query.blogs)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(coerceId)
      .filter(Boolean);

    if (arr.length) f.blogs = { $in: arr };
  }

  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;

  if (from || to) {
    f.createdAt = {};
    if (from && !isNaN(from)) f.createdAt.$gte = from;
    if (to && !isNaN(to)) f.createdAt.$lte = to;
    if (!Object.keys(f.createdAt).length) delete f.createdAt;
  }

  return f;
};

const CATEGORY_REL_DEFS = RELATION_MAP.Category.relations;

const extractRelationInputs = (body = {}, defs = {}) => {
  const incoming = {};
  for (const field of Object.keys(defs)) {
    if (!(field in body)) continue;
    const raw = body[field];
    const arr = Array.isArray(raw) ? raw : [raw];
    incoming[field] = arr.filter(Boolean).map(String);
    delete body[field];
  }
  return incoming;
};

const syncRelations = async (id, incoming, defs, fromType) => {
  const graph = await populateGraphRelations(id);
  for (const [field, ids] of Object.entries(incoming)) {
    const cfg = defs[field];
    if (!cfg) continue;

    const existingIds =
      (graph[cfg.type] || []).map((r) => String(r._id || r.id)).filter(Boolean);

    const add = ids.filter((v) => !existingIds.includes(v));
    const remove = existingIds.filter((v) => !ids.includes(v));

    for (const toId of add) {
      await addRelation(cfg.kind, id, fromType, toId, cfg.type);
    }
    for (const toId of remove) {
      await removeRelation(cfg.kind, id, toId);
    }
  }

  const finalGraph = await populateGraphRelations(id);
  const fieldValues = {};

  for (const [field, cfg] of Object.entries(defs)) {
    fieldValues[field] =
      (finalGraph[cfg.type] || []).map((r) => String(r._id || r.id)) || [];
  }

  return fieldValues;
};

// ---------------- Public ----------------
exports.listPublished = asyncHandler(async (req, res) => {
  const qs = new URLSearchParams(req.query || {}).toString() || "all";
  const cacheKey = `categories:list:${qs}`;

  const categories = await cache.getOrSet(cacheKey, LIST_TTL, async () => {
    const where = { status: "published", ...buildFilters(req) };
    const search = buildSearch(req.query.q);

    if (search) Object.assign(where, search);

    const items = await Category.find(where).populate("blogs").lean();

    for (const item of items) {
      item.relations = await populateGraphRelations(item._id);
    }

    return items;
  });

  cache.setCacheHeaders(res, LIST_TTL);
  return ok(res, { items: categories });
});

// GET by id OR tag
exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || "");
  const where = isObjectId(p) ? { _id: p } : { tag: p.toLowerCase() };

  const cacheKey = `categories:slug:${where._id || where.tag}`;

  const doc = await cache.getOrSet(cacheKey, DETAIL_TTL, async () => {
    const result = await Category.findOne({ ...where, status: "published" }).lean();
    if (!result) return null;

    const rawRelations = await populateGraphRelations(result._id);

    const fields = RELATION_MAP.Category.relations;

    for (const [field, cfg] of Object.entries(fields)) {
      const type = cfg.type; // "Blog", "Destination",   etc.
      result[field] = rawRelations[type] || [];
    }

    return result;
  });

  if (!doc) return notFound(res, "Category not found");

  cache.setCacheHeaders(res, DETAIL_TTL);
  return ok(res, doc);
});

// ---------------- Moderation ----------------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);

  const sort = latestSort(req.query.sort);
  const where = buildFilters(req);

  const search = buildSearch(req.query.q);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Category.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Category.countDocuments(where),
  ]);

  // ⭐ Universal graph relations
  for (const item of items) {
    item.relations = await populateGraphRelations(item._id);
  }

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

exports.getOneModeration = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const doc = await Category.findById(id).lean();
  if (!doc) return notFound(res, "Category not found");

  // ⭐ Graph relations
  // doc.relations = await populateGraphRelations(doc._id);
  Object.assign(doc, await getRelationFields("Category", doc._id));

  console.log(doc);

  return ok(res, doc);
});

// ---------------- Create ----------------
exports.create = asyncHandler(async (req, res) => {
  const relationInputs = extractRelationInputs({ ...req.body }, CATEGORY_REL_DEFS);

  const payload = {
    ...req.body,
    createdBy: req.user?._id || req.body.createdBy,
  };

  for (const field of Object.keys(relationInputs)) {
    delete payload[field];
  }

  const doc = await Category.create(payload);

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      doc._id,
      relationInputs,
      CATEGORY_REL_DEFS,
      "Category"
    );
    Object.assign(doc, relationValues);
  }

  doc.relations = await populateGraphRelations(doc._id);

  invalidateCategoryCaches(doc.tag || doc._id);
  return created(res, doc.toObject());
});

// ---------------- Update ----------------
exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const updates = { ...req.body };
  const relationInputs = extractRelationInputs(updates, CATEGORY_REL_DEFS);

  if ("createdBy" in updates) delete updates.createdBy;

  const doc = await Category.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!doc) return notFound(res, "Category not found");

  doc.relations = await populateGraphRelations(doc._id);

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      doc._id,
      relationInputs,
      CATEGORY_REL_DEFS,
      "Category"
    );
    Object.assign(doc, relationValues);
  }

  invalidateCategoryCaches(doc.tag || doc._id);
  return ok(res, doc);
});

// ---------------- Update Status ----------------
exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const { status } = req.body || {};
  if (!["draft", "published", "rejected"].includes(status)) {
    return fail(res, "Invalid status", 400);
  }

  const doc = await Category.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  ).lean();

  if (!doc) return notFound(res, "Category not found");

  doc.relations = await populateGraphRelations(doc._id);

  invalidateCategoryCaches(doc.tag || doc._id);
  return ok(res, doc);
});

// ---------------- Remove ----------------
exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const doc = await Category.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, "Category not found");

  invalidateCategoryCaches(doc.tag || doc._id);
  return ok(res, { id });
});

// ---------------- Duplicate ----------------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const original = await Category.findById(id).lean();
  if (!original) return notFound(res, "Category not found");

  const duplicatedData = {
    ...original,
    _id: undefined,
    name: original.name ? `${original.name} (Copy)` : "Untitled (Copy)",
    tag: `${original.tag || "category"}-copy-${Date.now()}`,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const duplicate = await Category.create(duplicatedData);

  duplicate.relations = await populateGraphRelations(duplicate._id);

  invalidateCategoryCaches(duplicate.tag || duplicate._id);
  return created(res, {
    message: "Category duplicated successfully",
    duplicate,
  });
});
