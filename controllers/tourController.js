// controllers/tour.controller.js

const jwt = require('jsonwebtoken');
const Tour = require('../models/Tour');
const User = require('../models/User');
const Testimonial = require('../models/Testimonial');

const {
  ok,
  created,
  notFound,
  fail,
  asyncHandler,
} = require('../utils/respond');

const {
  isObjectId,
  coerceId,
  latestSort,
  parsePagination,
  buildSearch,
  csvObjectIds,
  applyDateRange,
} = require('../utils/query');

const { notifyUser } = require('../utils/notifyUser');

// ⭐ NEW: Universal Relation System
const { populateGraphRelations } = require('../utils/relationHelper');
const { getRelationFields, RELATION_MAP } = require('../utils/relationMapper');
const { addRelation, removeRelation } = require('../utils/relation');

// Build filters from query
const buildFilters = (req) => {
  const f = {};
  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  // numeric ranges
  const minPrice =
    req.query.minPrice != null ? Number(req.query.minPrice) : null;
  const maxPrice =
    req.query.maxPrice != null ? Number(req.query.maxPrice) : null;

  if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
    f['details.pricePerPerson'] = {};
    if (!Number.isNaN(minPrice)) f['details.pricePerPerson'].$gte = minPrice;
    if (!Number.isNaN(maxPrice)) f['details.pricePerPerson'].$lte = maxPrice;

    if (!Object.keys(f['details.pricePerPerson']).length) {
      delete f['details.pricePerPerson'];
    }
  }

  // relations (legacy arrays)
  const blogs = csvObjectIds(req.query.blogs);
  if (blogs) f.blogs = { $in: blogs };

  const tours = csvObjectIds(req.query.tours);
  if (tours) f.tours = { $in: tours };

  const destinations = csvObjectIds(req.query.destinations);
  if (destinations) f.destinations = { $in: destinations };

  const tagMonths = csvObjectIds(req.query.tagMonths);
  if (tagMonths) f.tagMonths = { $in: tagMonths };

  if (req.query.place) f.place = String(req.query.place).trim();

  applyDateRange(f, req, 'createdAt');
  return f;
};

const searchFields = [
  'title',
  'slug',
  'place',
  'brief',
  'description',
  'tourType',
];

const TOUR_REL_DEFS = RELATION_MAP.Tour.relations;

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

    const existingIds = (graph[cfg.type] || [])
      .map((r) => String(r._id || r.id))
      .filter(Boolean);

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
const safeNumber = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const applyPriceFilter = (where, minRaw, maxRaw) => {
  const min = safeNumber(minRaw);
  const max = safeNumber(maxRaw);

  if (min === null && max === null) return;

  where['details.pricePerPerson'] = {};
  if (min !== null) where['details.pricePerPerson'].$gte = min;
  if (max !== null) where['details.pricePerPerson'].$lte = max;
};
const applyTourTypeFilter = (where, tourType) => {
  if (!tourType) return;

  const types = Array.isArray(tourType) ? tourType : [tourType];
  where.tourType = { $in: types };
};

// ---------- Public ----------

exports.listPublished = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = { status: 'published', ...buildFilters(req) };

  if (req.query.tourType) {
    where.tourType = req.query.tourType;
  }

  const search = buildSearch(req.query.q, searchFields);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Tour.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Tour.countDocuments(where),
  ]);

  console.log('items', items);

  const fields = RELATION_MAP.Tour.relations; // { destinations: {...},  blogs: {...}, ... }

  for (const item of items) {
    const rawRelations = await populateGraphRelations(item._id);
    // rawRelations = { Blog: [...], Destination: [...],  Tour: [...] }

    // normalize into tour fields
    for (const [field, cfg] of Object.entries(fields)) {
      const type = cfg.type; // "Blog", "Destination", etc.
      item[field] = rawRelations[type] || [];
    }
  }

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// ---------- Public: getBySlugOrId ----------

exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || '');
  const where = isObjectId(p) ? { _id: p } : { slug: p.toLowerCase() };

  const testimonialSelect =
    'name heading review stars img profileImg date travelType createdAt';

  const doc = await Tour.findOne({
    ...where,
    status: 'published',
  })
    // ⭐ Legacy relational arrays (kept intact)
    .populate('tours')
    .populate('blogs')
    .populate('tagMonths')

    // Creator info (untouched)
    .populate({
      path: 'createdBy',
      select: 'name email profileImg bio slug',
    })

    // Testimonials (untouched)
    .populate({
      path: 'testimonials',
      match: { status: 'published' },
      select: testimonialSelect,
      options: { sort: { createdAt: -1 } },
    })
    .lean();

  if (!doc) return notFound(res, 'Tour not found');

  const rawRelations = await populateGraphRelations(doc._id);

  const fields = RELATION_MAP.Tour.relations;

  // Apply relations
  for (const [field, cfg] of Object.entries(fields)) {
    const type = cfg.type; // "Blog", "Destination",   etc.
    doc[field] = rawRelations[type] || [];
  }

  return ok(res, doc);
});

// ---------- Public: Add Testimonial (unchanged logic) ----------

exports.addTestimonialPublic = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || '');
  const where = isObjectId(p) ? { _id: p } : { slug: p.toLowerCase() };

  // Only allow adding reviews to published tours
  const tour = await Tour.findOne({ ...where, status: 'published' })
    .select('_id title createdBy')
    .lean();

  if (!tour) return notFound(res, 'Tour not found');

  // Try to resolve user from token (public endpoint)
  let user = req.user || {};
  if (!user?._id) {
    const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (m && process.env.JWT_SECRET) {
      try {
        const payload = jwt.verify(m[1].trim(), process.env.JWT_SECRET, {
          algorithms: ['HS256'],
        });
        const u = await User.findById(payload.id).lean();
        if (u) user = u;
      } catch (e) {
        // ignore token errors to allow guest reviews
      }
    }
  }
  const {
    heading,
    review,
    stars,
    travelType,
    date,
    img,
    place,
    profileImg,
    description,
    name,
  } = req.body || {};

  if (!heading || !(review || description) || !stars) {
    return fail(res, 'heading, review, and stars are required', 400);
  }

  const text = String(review || description).trim();
  const starsNum = Math.max(1, Math.min(5, Number(stars)));
  const images = Array.isArray(img) ? img.filter(Boolean).slice(0, 3) : [];

  const reviewerName = String(name || user.name || 'Guest').trim() || 'Guest';

  // Testimonial is created as DRAFT (unchanged)
  const t = await Testimonial.create({
    tour: tour._id,
    name: reviewerName,
    place: place ? String(place).trim() : undefined,
    travelType: travelType || undefined,
    stars: starsNum,
    date: date || new Date().toISOString().slice(0, 10),
    review: text,
    img: images,
    profileImg: profileImg || user.profileImg || undefined,
    heading: String(heading).trim(),
    status: 'draft',
    createdBy: user._id || undefined,
    tourCreatedBy: tour.createdBy || undefined,
  });

  await Tour.findByIdAndUpdate(
    tour._id,
    { $addToSet: { testimonials: t._id } },
    { new: false },
  );

  return created(res, {
    testimonial: t.toObject(),
    message: 'Review submitted for moderation.',
  });
});

// ---------- Moderation: list all tours ----------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);

  const where = { status: 'published' };

  // Creator restriction
  if ((req.user?.roleName || req.user?.role) === 'creator') {
    where.createdBy = req.user._id;
  }

  // Search
  if (req.query.q && req.query.q.trim()) {
    const q = req.query.q.trim();
    where.$or = [
      { title: { $regex: q, $options: 'i' } },
      { place: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
  }

  // Filters
  applyTourTypeFilter(where, req.query.tourType);
  applyPriceFilter(where, req.query.minPrice, req.query.maxPrice);

  // Duration (minimum days)
  if (req.query.duration) {
    const durations = Array.isArray(req.query.duration)
      ? req.query.duration.map(safeNumber).filter(Boolean)
      : [safeNumber(req.query.duration)].filter(Boolean);

    if (durations.length) {
      where.$or = durations.map((d) => ({
        'details.totalDays': { $gte: d },
      }));
    }
  }

  const [items, total] = await Promise.all([
    Tour.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Tour.countDocuments(where),
  ]);

  // Attach relations (safe but expensive)
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

// ---------- Moderation: get one ----------
exports.getOneModeration = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const doc = await Tour.findById(id).lean();
  if (!doc) return notFound(res, 'Tour not found');

  // ⭐ Add relation graph
  // doc.relations = await populateGraphRelations(doc._id);
  Object.assign(doc, await getRelationFields('Tour', doc._id));

  return ok(res, doc);
});

// ---------- Create ----------
exports.create = asyncHandler(async (req, res) => {
  const createdBy = req.user?._id;

  const relationInputs = extractRelationInputs({ ...req.body }, TOUR_REL_DEFS);

  const payload = {
    ...req.body,
    createdBy,
  };

  // Sanitize strings
  ['title', 'slug', 'brief', 'place', 'tourType'].forEach((k) => {
    if (typeof payload[k] === 'string') payload[k] = payload[k].trim();
  });

  for (const field of Object.keys(relationInputs)) {
    delete payload[field];
  }

  // Normalize paymentConfig (price instead of percent)
  if (payload.paymentConfig) {
    payload.paymentConfig = {
      full: {
        enabled: payload.paymentConfig.full?.enabled ?? true,
      },
      partial: {
        enabled: payload.paymentConfig.partial?.enabled ?? false,
        price: Number(payload.paymentConfig.partial?.price ?? 0),
      },
    };
  }

  const doc = await Tour.create(payload);

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      doc._id,
      relationInputs,
      TOUR_REL_DEFS,
      'Tour',
    );
    Object.assign(doc, relationValues);
  }

  doc.relations = await populateGraphRelations(doc._id);

  return created(res, doc.toObject());
});

// ---------- Update (SENSITIVE) ----------
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  let updates = { ...req.body };
  const relationInputs = extractRelationInputs(updates, TOUR_REL_DEFS);
  delete updates.createdBy;
  delete updates.createdByRole;
  delete updates.rejectionReason;

  // Normalize dateRange
  if (updates.dateRange?.startDate && updates.dateRange?.endDate) {
    updates.dateRange = {
      startDate: new Date(updates.dateRange.startDate),
      endDate: new Date(updates.dateRange.endDate),
    };
  }
  delete updates['dateRange.startDate'];
  delete updates['dateRange.endDate'];

  // Sanitize strings
  ['title', 'slug', 'brief', 'place', 'tourType'].forEach((k) => {
    if (typeof updates[k] === 'string') updates[k] = updates[k].trim();
  });

  const existing = await Tour.findById(id);
  if (!existing) return notFound(res, 'Tour not found');

  // Replace full array fields
  const arrayFields = [
    'days',
    'itinerary',
    'faqs',
    'highlights',
    'moments',
    'stays',
    'galleryImgs',
    'featuredPlaces',
    'blogs',
    'tours',
    'destinations',
    'tagMonths',
    'testimonials',
    'video',
  ];

  for (const f of arrayFields) {
    if (Array.isArray(updates[f])) {
      existing[f] = updates[f];
      delete updates[f];
    }
  }

  // Nested details
  if (updates.details && typeof updates.details === 'object') {
    existing.details = existing.details || {};
    Object.assign(existing.details, updates.details);
    delete updates.details;
  }

  // Nested inclusions
  if (updates.inclusions && typeof updates.inclusions === 'object') {
    existing.inclusions = existing.inclusions || {};
    Object.assign(existing.inclusions, updates.inclusions);
    delete updates.inclusions;
  }

  // --- NEW: paymentConfig handling (fixed price logic) ---
  if (updates.paymentConfig && typeof updates.paymentConfig === 'object') {
    existing.paymentConfig = {
      full: {
        enabled:
          updates.paymentConfig.full?.enabled ??
          existing.paymentConfig.full.enabled ??
          true,
      },
      partial: {
        enabled:
          updates.paymentConfig.partial?.enabled ??
          existing.paymentConfig.partial.enabled ??
          false,
        price: Number(
          updates.paymentConfig.partial?.price ??
            existing.paymentConfig.partial.price ??
            0,
        ),
      },
    };
    delete updates.paymentConfig;
  }

  // Cleanup blocks.* fields
  [
    'blocks.activity',
    'blocks.image',
    'blocks.notes',
    'blocks.time',
    'blocks.title',
  ].forEach((k) => {
    if (k in updates) delete updates[k];
  });

  // Normalize video array
  if (updates.video != null || updates.videos != null) {
    const raw = updates.video ?? updates.videos;
    let arr = [];

    if (Array.isArray(raw)) {
      arr = raw
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (typeof raw === 'string') {
      arr = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const urlRe = /^https?:\/\/\S+$/i;
    existing.video = arr.filter((s) => urlRe.test(s));

    existing.markModified('video');
    delete updates.video;
    delete updates.videos;
  }

  // Merge remaining simple fields
  Object.assign(existing, updates);

  const previousStatus = existing.status;
  const updatedTour = await existing.save();

  // Notify on status change
  if (updatedTour.status !== previousStatus) {
    const user = await User.findById(existing.createdBy).select('email');
    if (user?.email) {
      await notifyUser({
        type: 'content',
        content: {
          title: updatedTour.title,
          status: updatedTour.status,
          ownerEmail: user.email,
        },
      });
    }
  }

  const withRelations = updatedTour.toObject();
  withRelations.relations = await populateGraphRelations(updatedTour._id);

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      updatedTour._id,
      relationInputs,
      TOUR_REL_DEFS,
      'Tour',
    );
    Object.assign(withRelations, relationValues);
  }

  return ok(res, withRelations);
});

// ---------- Update Status ----------
exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const { status } = req.body || {};

  if (!['draft', 'published', 'rejected'].includes(status)) {
    return fail(res, 'Invalid status', 400);
  }

  const patch = { status };

  const doc = await Tour.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true,
  }).lean();

  if (!doc) return notFound(res, 'Tour not found');

  // ⭐ Add universal relations
  doc.relations = await populateGraphRelations(doc._id);

  return ok(res, doc);
});

// ---------- Remove ----------
exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const doc = await Tour.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, 'Tour not found');

  return ok(res, { id });
});

// ---------- Duplicate ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const original = await Tour.findById(id).lean();
  if (!original) return notFound(res, 'Tour not found');

  const duplicatedData = {
    ...original,
    _id: undefined,
    title: original.title ? `${original.title} (Copy)` : 'Untitled (Copy)',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // regenerate slug
  if (duplicatedData.slug)
    duplicatedData.slug = `${duplicatedData.slug}-copy-${Date.now()}`;

  // duplicate SEO
  if (duplicatedData.seo) {
    if (duplicatedData.seo.metaTitle)
      duplicatedData.seo.metaTitle = `${duplicatedData.seo.metaTitle} (Copy)`;

    if (duplicatedData.seo.metaDescription)
      duplicatedData.seo.metaDescription = `${duplicatedData.seo.metaDescription} (Copy)`;
  }

  // NEW: ensure paymentConfig duplicates safely
  if (duplicatedData.paymentConfig) {
    duplicatedData.paymentConfig = {
      full: {
        enabled: duplicatedData.paymentConfig.full?.enabled ?? true,
      },
      partial: {
        enabled: duplicatedData.paymentConfig.partial?.enabled ?? false,
        price: Number(duplicatedData.paymentConfig.partial?.price ?? 0),
      },
    };
  }

  const duplicate = await Tour.create(duplicatedData);

  duplicate.relations = await populateGraphRelations(duplicate._id);

  return created(res, {
    message: 'Tour duplicated successfully',
    duplicate,
  });
});

exports.searchHome = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);

  const where = { status: 'published' };

  // PLACE
  if (req.query.place) {
    where.place = new RegExp(String(req.query.place).trim(), 'i');
  }

  // DURATION: "7+days" => totalDays >= 7
  if (req.query.duration) {
    const num = parseInt(String(req.query.duration));
    if (!isNaN(num)) {
      where['details.totalDays'] = { $gte: num };
    }
  }

  // CATEGORY
  if (req.query.category) {
    where.tourType = String(req.query.category).trim();
  }

  // BUDGET
  const min = req.query.min ? Number(req.query.min) : null;
  const max = req.query.max ? Number(req.query.max) : null;
  if (min || max) {
    where['details.pricePerPerson'] = {};
    if (min) where['details.pricePerPerson'].$gte = min;
    if (max) where['details.pricePerPerson'].$lte = max;
  }

  // EXECUTE PAGINATED FIND
  const [items, total] = await Promise.all([
    Tour.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),

    Tour.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

exports.searchTours = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);

  /** -------------------------------------------------
   * BASE MATCH
   * ------------------------------------------------- */
  const baseMatch = { status: 'published' };

  // Text search
  if (req.query.q && req.query.q.trim()) {
    const q = req.query.q.trim();
    baseMatch.$or = [
      { title: { $regex: q, $options: 'i' } },
      { place: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
  }

  /** -------------------------------------------------
   * FILTER MATCH
   * ------------------------------------------------- */
  const filterMatch = {};

  applyTourTypeFilter(filterMatch, req.query.tourType);
  applyPriceFilter(filterMatch, req.query.minPrice, req.query.maxPrice);

  /** -------------------------------------------------
   * DURATION FILTER (MIN DAYS)
   * ------------------------------------------------- */
  let durationStage = [];
  if (req.query.duration) {
    const durations = Array.isArray(req.query.duration)
      ? req.query.duration.map(safeNumber).filter(Boolean)
      : [safeNumber(req.query.duration)].filter(Boolean);

    if (durations.length) {
      durationStage.push({
        $match: {
          $or: durations.map((d) => ({
            'details.totalDays': { $gte: d },
          })),
        },
      });
    }
  }

  /** -------------------------------------------------
   * RATING FILTER
   * ------------------------------------------------- */
  let ratingStage = [];
  if (req.query.minRating) {
    const ratings = Array.isArray(req.query.minRating)
      ? req.query.minRating.map(safeNumber).filter(Boolean)
      : [safeNumber(req.query.minRating)].filter(Boolean);

    if (ratings.length) {
      ratingStage.push({
        $match: {
          $or: ratings.map((r) => ({
            avgRating: { $gte: r },
          })),
        },
      });
    }
  }

  /** -------------------------------------------------
   * PIPELINE
   * ------------------------------------------------- */
  const pipeline = [
    { $match: baseMatch },

    {
      $lookup: {
        from: 'testimonials',
        localField: '_id',
        foreignField: 'tour',
        as: 'ratings',
      },
    },

    {
      $addFields: {
        avgRating: { $ifNull: [{ $avg: '$ratings.stars' }, 0] },
      },
    },

    ...(Object.keys(filterMatch).length ? [{ $match: filterMatch }] : []),
    ...durationStage,
    ...ratingStage,

    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const countPipeline = pipeline
    .filter((s) => !('$skip' in s) && !('$limit' in s) && !('$sort' in s))
    .concat({ $count: 'total' });

  const [items, countResult] = await Promise.all([
    Tour.aggregate(pipeline),
    Tour.aggregate(countPipeline),
  ]);

  const total = countResult[0]?.total || 0;

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});
