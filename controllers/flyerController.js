const mongoose = require("mongoose");
const Flyer = require("../models/Flyer");
const User = require("../models/User");
const cache = require("../lib/cache/cache");

const {
  ok,
  created,
  notFound,
  fail,
  asyncHandler,
} = require("../utils/respond");

const {
  parsePagination,
  latestSort,
  buildSearch,
  isObjectId,
  coerceId,
} = require("../utils/query");
const { populateGraphRelations } = require("../utils/relationHelper");
const { buildFolderPath } = require("../utils/pathbuilderandpublicurl");
const { uploadImage } = require("../utils/uploadHelper");
const LIST_TTL = 300; // lists: 2–5 minutes
const DETAIL_TTL = 900; // detail: 10–30 minutes
const invalidateFlyerCaches = (id) => {
  cache.del("flyers:list:all");
  if (id) cache.del(`flyers:${id}`);
};

// ---------------- HELPERS ----------------

const buildFilters = (req) => {
  const f = {};
  if (req.query.status !== undefined) f.status = req.query.status;
  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }
  if (req.query.type) f.type = req.query.type;
  return f;
};

function clean(obj) {
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined || v === null || v === "") delete obj[k];
    if (typeof v === "object" && !Array.isArray(v)) clean(v);
  });
  return obj;
}

// ---------------- PUBLIC LISTING ----------------
exports.listPublished = asyncHandler(async (req, res) => {
  const qs = new URLSearchParams(req.query || {}).toString() || "all";
  const cacheKey = `flyers:list:${qs}`;

  const payload = await cache.getOrSet(cacheKey, LIST_TTL, async () => {
    const { page, limit, skip } = parsePagination(req);
    const filters = buildFilters(req);
    const search = buildSearch(req.query.q, ["title", "description"]);

    const where = { status: "published", ...(filters || {}) };
    if (search) Object.assign(where, search);

    const sort = { updatedAt: -1 };

    const [items, total] = await Promise.all([
      Flyer.find(where)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate({ path: "tour", select: "title slug" })
        .populate({ path: "destination", select: "title slug" })
        .lean(),

      Flyer.countDocuments(where),
    ]);

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

// ---------------- MODERATION ----------------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const search = buildSearch(req.query.q, ["title", "description", "type"]);
  const filters = clean(buildFilters(req));

  const where = { ...(filters || {}) };

  const role = (req.user?.roleName || req.user?.role || "").toLowerCase();
  if (role === "creator") where.createdBy = req.user._id;

  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Flyer.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Flyer.countDocuments(where),
  ]);

  for (const flyer of items) {
    flyer.relations = await populateGraphRelations(flyer._id);
  }

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// ---------------- GET SINGLE ----------------
exports.getOne = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid flyer id");

  const cacheKey = `flyers:${id}`;
  const flyer = await cache.getOrSet(cacheKey, DETAIL_TTL, async () =>
    Flyer.findById(id).populate("destination").populate("tour").lean()
  );

  if (!flyer) return notFound(res, "Flyer not found");

  flyer.relations = await populateGraphRelations(flyer._id);

  cache.setCacheHeaders(res, DETAIL_TTL);
  return ok(res, flyer);
});

// ---------------- CREATE ----------------
exports.create = asyncHandler(async (req, res) => {
  const createdBy = req.user._id;
  const payload = { ...req.body, createdBy, status: req.body.status ?? true };

  const flyer = await Flyer.create(payload);

  if (req.files?.length > 0) {
    const imageUrls = [];
    for (const file of req.files) {
      const folderPath = buildFolderPath({
        modelKey: "flyer",
        userId: req.user._id,
        recordId: flyer._id,
      });
      const url = await uploadImage({
        folderPath,
        file,
        modelKey: "flyer",
        userId: req.user._id,
        recordId: flyer._id,
      });
      imageUrls.push(url);
    }
    flyer.images = imageUrls;
    await flyer.save();
  }

  flyer.relations = await populateGraphRelations(flyer._id);
  invalidateFlyerCaches(flyer._id);
  return created(res, flyer);
});

// ---------------- UPDATE ----------------
exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid flyer id");

  const existing = await Flyer.findById(id);
  if (!existing) return notFound(res, "Flyer not found");

  const updates = { ...req.body };
  const updatedFlyer = await Flyer.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  updatedFlyer.relations = await populateGraphRelations(id);

  invalidateFlyerCaches(id);
  return ok(res, updatedFlyer);
});

// ---------------- DELETE ----------------
exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid flyer id");

  const flyer = await Flyer.findByIdAndDelete(id).lean();
  if (!flyer) return notFound(res, "Flyer not found");

  invalidateFlyerCaches(id);
  return ok(res, { id });
});

// ---------------- DUPLICATE ----------------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid flyer id");

  const original = await Flyer.findById(id).lean();
  if (!original) return notFound(res, "Flyer not found");

  const duplicateData = {
    ...original,
    _id: undefined,
    title: original.title ? `${original.title} (Copy)` : "Untitled (Copy)",
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  delete duplicateData.createdAt;
  delete duplicateData.updatedAt;

  const duplicate = await Flyer.create(duplicateData);
  duplicate.relations = await populateGraphRelations(duplicate._id);

  invalidateFlyerCaches(duplicate._id);
  return created(res, { message: "Flyer duplicated successfully", duplicate });
});
