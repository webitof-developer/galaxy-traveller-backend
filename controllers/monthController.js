// controllers/month.controller.js

const Month = require("../models/Month");

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

// ⭐ NEW: Universal Relation Graph
const { populateGraphRelations } = require("../utils/relationHelper");
const { getRelationFields, RELATION_MAP } = require("../utils/relationMapper");
const { addRelation, removeRelation } = require("../utils/relation");

// ---------------- Filters ----------------
const buildFilters = (req) => {
  const f = {};

  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  const tagBlogs = csvObjectIds(req.query.tagBlogs);
  if (tagBlogs) f.tagBlogs = { $in: tagBlogs };

  const tagDestinations = csvObjectIds(req.query.tagDestinations);
  if (tagDestinations) f.tagDestinations = { $in: tagDestinations };

  const tagTours = csvObjectIds(req.query.tagTours);
  if (tagTours) f.tagTours = { $in: tagTours };

  applyDateRange(f, req, "createdAt");
  return f;
};

const MONTH_REL_DEFS = RELATION_MAP.Month.relations;

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

function updateSubSchemaFields(updateData, subSchemaKey, schemaFields) {
  if (updateData[subSchemaKey]) {
    schemaFields.forEach((field) => {
      if (updateData[subSchemaKey][field] !== undefined) {
        updateData[`${subSchemaKey}.${field}`] =
          updateData[subSchemaKey][field];
      }
    });
    delete updateData[subSchemaKey];
  }
}

// ---------------- Public ----------------
exports.listPublished = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);

  const sort = latestSort(req.query.sort);
  const where = { status: "published", ...buildFilters(req) };

  const search = buildSearch(req.query.q, ["month", "monthTag"]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Month.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Month.countDocuments(where),
  ]);

  // ⭐ Add universal relation graph to each month
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

// ---------------- Public: Get by Slug or ID ----------------
exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || "");
  const where = isObjectId(p) ? { _id: p } : { month: p.toLowerCase() };

  const doc = await Month.findOne({ ...where, status: "published" })
    .populate("tagBlogs")
    .populate("tagDestinations")
    .populate("tagTours")
    .lean();

  if (!doc) return notFound(res, "Month not found");

  const rawRelations = await populateGraphRelations(doc._id);

  const fields = RELATION_MAP.Month.relations;

  // Apply relations
  for (const [field, cfg] of Object.entries(fields)) {
    const type = cfg.type; // "Blog", "Destination",  etc.
    doc[field] = rawRelations[type] || [];
  }
  return ok(res, doc);
});

// ---------------- Moderation ----------------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);

  const sort = latestSort(req.query.sort);
  const where = buildFilters(req);

  const search = buildSearch(req.query.q, ["month", "monthTag"]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Month.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Month.countDocuments(where),
  ]);

  // ⭐ Add relation graph (lightweight)
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

  const doc = await Month.findById(id).lean();
  if (!doc) return notFound(res, "Month not found");

  // doc.relations = await populateGraphRelations(doc._id);
  Object.assign(doc, await getRelationFields("Month", doc._id));

  return ok(res, doc);
});

// ---------------- Create ----------------
exports.create = asyncHandler(async (req, res) => {
  const relationInputs = extractRelationInputs({ ...req.body }, MONTH_REL_DEFS);
  const payload = {
    ...req.body,
    createdBy: req.user?._id || req.body.createdBy,
  };

  for (const field of Object.keys(relationInputs)) {
    delete payload[field];
  }

  const doc = await Month.create(payload);

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      doc._id,
      relationInputs,
      MONTH_REL_DEFS,
      "Month"
    );
    Object.assign(doc, relationValues);
  }

  doc.relations = await populateGraphRelations(doc._id);

  return created(res, doc.toObject());
});

// ---------------- Update ----------------
exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const updates = { ...req.body };
  const relationInputs = extractRelationInputs(updates, MONTH_REL_DEFS);
  if ("createdBy" in updates) delete updates.createdBy;

  updateSubSchemaFields(updates, "highlight", ["title", "brief", "img"]);

  const doc = await Month.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!doc) return notFound(res, "Month not found");

  doc.relations = await populateGraphRelations(doc._id);

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      doc._id,
      relationInputs,
      MONTH_REL_DEFS,
      "Month"
    );
    Object.assign(doc, relationValues);
  }

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

  const doc = await Month.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  ).lean();

  if (!doc) return notFound(res, "Month not found");

  doc.relations = await populateGraphRelations(doc._id);

  return ok(res, doc);
});

// ---------------- Remove ----------------
exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const doc = await Month.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, "Month not found");

  return ok(res, { id });
});

// ---------------- Duplicate ----------------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const original = await Month.findById(id).lean();
  if (!original) return notFound(res, "Month not found");

  const duplicatedData = {
    ...original,
    _id: undefined,
    month: original.month ? `${original.month} (Copy)` : "Untitled (Copy)",
    monthTag: `${original.monthTag || "month"}-copy-${Date.now()}`,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const duplicate = await Month.create(duplicatedData);

  duplicate.relations = await populateGraphRelations(duplicate._id);

  return created(res, {
    message: "Month duplicated successfully",
    duplicate,
  });
});
