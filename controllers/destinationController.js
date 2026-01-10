// controllers/destination.controller.js

const Destination = require("../models/Destination");
const {
  ok,
  created,
  notFound,
  fail,
  asyncHandler,
} = require("../utils/respond");
const cache = require("../lib/cache/cache");

const {
  isObjectId,
  coerceId,
  latestSort,
  parsePagination,
  buildSearch,
  csvObjectIds,
  applyDateRange,
} = require("../utils/query");

const { populateGraphRelations } = require("../utils/relationHelper");
const { getRelationFields, RELATION_MAP } = require("../utils/relationMapper");
const LIST_TTL = 300; // lists: 2–5 minutes
const DETAIL_TTL = 900; // detail: 10–30 minutes
const invalidateDestinationCaches = (slug) => {
  cache.del("destinations:list:all");
  if (slug) cache.del(`destinations:slug:${slug}`);
};

// Build filters from query
const buildFilters = (req) => {
  const f = {};

  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  const blogs = csvObjectIds(req.query.blogs);
  if (blogs) f.blogs = { $in: blogs };

  const tours = csvObjectIds(req.query.tours);
  if (tours) f.tours = { $in: tours };

  const tagMonths = csvObjectIds(req.query.tagMonths);
  if (tagMonths) f.tagMonths = { $in: tagMonths };

  const minP = parseFloat(req.query.minPrice);
  const maxP = parseFloat(req.query.maxPrice);

  if (!isNaN(minP) || !isNaN(maxP)) {
    f.startingPrice = {};
    if (!isNaN(minP)) f.startingPrice.$gte = minP;
    if (!isNaN(maxP)) f.startingPrice.$lte = maxP;
  }

  applyDateRange(f, req, "createdAt");
  return f;
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

// ---------- Public ----------
exports.listPublished = asyncHandler(async (req, res) => {
  const qs = new URLSearchParams(req.query || {}).toString() || "all";
  const cacheKey = `destinations:list:${qs}`;

  const payload = await cache.getOrSet(cacheKey, LIST_TTL, async () => {
    const { page, limit, skip } = parsePagination(req);
    const sort = latestSort(req.query.sort);
    const where = { status: "published", ...buildFilters(req) };
    const search = buildSearch(req.query.q, ["title", "slug", "description"]);
    if (search) Object.assign(where, search);

    const [items, total] = await Promise.all([
      Destination.find(where).sort(sort).skip(skip).limit(limit).lean(),
      Destination.countDocuments(where),
    ]);

    const fields = RELATION_MAP.Destination.relations;

    for (const item of items) {
      const rawRelations = await populateGraphRelations(item._id);
      for (const [field, cfg] of Object.entries(fields)) {
        const type = cfg.type; // "Blog", "Destination", etc.
        item[field] = rawRelations[type] || [];
      }
    }

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  cache.setCacheHeaders(res, LIST_TTL);
  return ok(res, payload);
});

exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || "");
  const where = isObjectId(p) ? { _id: p } : { slug: p.toLowerCase() };

  const cacheKey = `destinations:slug:${where._id || where.slug}`;
  const doc = await cache.getOrSet(cacheKey, DETAIL_TTL, async () => {
    const result = await Destination.findOne({
      ...where,
      status: "published",
    })
      .populate("blogs")
      .populate("tours")
      .populate("tagMonths")
      .lean();

    if (!result) return null;

    const rawRelations = await populateGraphRelations(result._id);

    const fields = RELATION_MAP.Destination.relations;

    for (const [field, cfg] of Object.entries(fields)) {
      const type = cfg.type; // "Blog", "Destination",   etc.
      result[field] = rawRelations[type] || [];
    }

    return result;
  });

  if (!doc) return notFound(res, "Destination not found");

  cache.setCacheHeaders(res, DETAIL_TTL);
  return ok(res, doc);
});

// ---------- Moderation ----------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = buildFilters(req);

  if ((req.user?.roleName || req.user?.role) == "creator") {
    where.createdBy = req.user._id;
  }

  const search = buildSearch(req.query.q, ["title", "slug", "description"]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Destination.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Destination.countDocuments(where),
  ]);

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

  const doc = await Destination.findById(id).lean();
  if (!doc) return notFound(res, "Destination not found");

  // doc.relations = await populateGraphRelations(doc._id);

  Object.assign(doc, await getRelationFields("Destination", doc._id));

  // console.log(doc);
  return ok(res, doc);
});

// ---------- CRUD ----------
exports.create = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    createdBy: req.user?._id || req.body.createdBy,
  };

  const doc = await Destination.create(payload);

  // Add relations section
  doc.relations = await populateGraphRelations(doc._id);

  invalidateDestinationCaches(doc.slug);

  return created(res, doc.toObject());
});

exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const updates = { ...req.body };
  if ("createdBy" in updates) delete updates.createdBy;

  updateSubSchemaFields(updates, "highlight", ["title", "brief", "img"]);

  const doc = await Destination.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!doc) return notFound(res, "Destination not found");

  doc.relations = await populateGraphRelations(doc._id);

  invalidateDestinationCaches(doc.slug);
  return ok(res, doc);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const { status } = req.body || {};
  if (!["draft", "published", "rejected"].includes(status)) {
    return fail(res, "Invalid status", 400);
  }

  const doc = await Destination.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  ).lean();

  if (!doc) return notFound(res, "Destination not found");

  doc.relations = await populateGraphRelations(doc._id);

  invalidateDestinationCaches(doc.slug);
  return ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const doc = await Destination.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, "Destination not found");

  invalidateDestinationCaches(doc.slug);
  return ok(res, { id });
});

// ---------- Duplicate ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const original = await Destination.findById(id).lean();
  if (!original) return notFound(res, "Destination not found");

  const duplicatedData = {
    ...original,
    _id: undefined,
    title: original.title ? `${original.title} (Copy)` : "Untitled (Copy)",
    slug: `${original.slug || "destination"}-copy-${Date.now()}`,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const duplicate = await Destination.create(duplicatedData);
  duplicate.relations = await populateGraphRelations(duplicate._id);

  invalidateDestinationCaches(duplicate.slug);
  return created(res, {
    message: "Destination duplicated successfully",
    duplicate,
  });
});
