// controllers/testimonial.controller.js
const Testimonial = require("../models/Testimonial");
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

// Build filters from query
const buildFilters = (req) => {
  const f = {};
  if (req.query.status) f.status = req.query.status;

  if (req.query.tour) {
    const id = coerceId(req.query.tour);
    if (id) f.tour = id;
  }
  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  if (req.query.date) {
    // exact YYYY-MM-DD match
    f.date = String(req.query.date);
  }

  applyDateRange(f, req, "createdAt"); // ?from&to on createdAt
  return f;
};

// ---------- Public ----------
exports.listPublished = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = { status: "published", ...buildFilters(req) };
  const search = buildSearch(req.query.q, ["name", "place", "review"]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Testimonial.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Testimonial.countDocuments(where),
  ]);
  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// GET by id only (no slug on testimonials)
exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || "");
  if (!isObjectId(p)) return notFound(res, "Invalid id");
  const doc = await Testimonial.findOne({ _id: p, status: "published" }).lean();
  if (!doc) return notFound(res, "Testimonial not found");
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
  const search = buildSearch(req.query.q, ["name", "place", "review"]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Testimonial.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Testimonial.countDocuments(where),
  ]);
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
  const doc = await Testimonial.findById(id).lean();
  if (!doc) return notFound(res, "Testimonial not found");
  return ok(res, doc);
});

exports.create = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    createdBy: req.user?._id || req.body.createdBy,
  };
  const doc = await Testimonial.create(payload);
  return created(res, doc.toObject());
});

exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const updates = { ...req.body };
  if ("createdBy" in updates) delete updates.createdBy;

  const doc = await Testimonial.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();
  if (!doc) return notFound(res, "Testimonial not found");
  return ok(res, doc);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");
  const { status } = req.body || {};
  if (!["draft", "published", "rejected"].includes(status)) {
    return fail(res, "Invalid status", 400);
  }
  const doc = await Testimonial.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  ).lean();
  if (!doc) return notFound(res, "Testimonial not found");
  return ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");
  const doc = await Testimonial.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, "Testimonial not found");
  return ok(res, { id });
});

// ---------- Duplicate Testimonial ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, "Invalid id");

  const original = await Testimonial.findById(id).lean();
  if (!original) return notFound(res, "Testimonial not found");

  // Prepare duplicated data
  const duplicatedData = {
    ...original,
    _id: undefined, // remove original ID
    name: original.name ? `${original.name} (Copy)` : "Unnamed (Copy)",
    status: "draft", // default duplicate to draft
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Prevent unintended carryovers
  if (duplicatedData.createdBy) duplicatedData.createdBy = req.user?._id;
  if (duplicatedData.tourCreatedBy) delete duplicatedData.tourCreatedBy; // optional cleanup

  const duplicate = await Testimonial.create(duplicatedData);

  return created(res, {
    message: "Testimonial duplicated successfully",
    duplicate,
  });
});
