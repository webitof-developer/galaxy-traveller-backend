// controllers/lead.controller.js
const Lead = require('../models/Lead');
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
  applyDateRange,
} = require('../utils/query');
const Joi = require('joi');
const path = require('path');
const fs = require('fs');
const { sendMail } = require('../utils/mailer');
// Build filters from querystring
const buildFilters = (req) => {
  const f = {};
  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  if (req.query.year) {
    const y = Number(req.query.year);
    if (!Number.isNaN(y)) f.year = y;
  }
  if (req.query.month) {
    f.month = String(req.query.month);
  }
  if (req.query.source) {
    f.source = String(req.query.source);
  }

  // Usage:
  addRangeFilter(f, 'people', req.query.minPeople, req.query.maxPeople);
  addRangeFilter(f, 'budget', req.query.minBudget, req.query.maxBudget);

  applyDateRange(f, req, 'createdAt');
  return f;
};

function addRangeFilter(f, field, minQuery, maxQuery) {
  const min = minQuery ? Number(minQuery) : undefined;
  const max = maxQuery ? Number(maxQuery) : undefined;

  if (
    (min !== undefined && !Number.isNaN(min)) ||
    (max !== undefined && !Number.isNaN(max))
  ) {
    f[field] = {};
    if (min !== undefined && !Number.isNaN(min)) f[field].$gte = min;
    if (max !== undefined && !Number.isNaN(max)) f[field].$lte = max;
  }
}

// ---------- Public ----------
exports.listPublished = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = { status: 'published', ...buildFilters(req) };
  const search = buildSearch(req.query.q, [
    'name',
    'email',
    'countryCode',
    'month',
    'duration',
    'source',
    'destination',
    'comment',
  ]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Lead.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Lead.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// Note: this model has no slug; we still accept :idOrSlug param, but only ObjectId will match.
exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || '');
  if (!isObjectId(p)) return notFound(res, 'Lead not found');
  const doc = await Lead.findOne({ _id: p, status: 'published' }).lean();
  if (!doc) return notFound(res, 'Lead not found');
  return ok(res, doc);
});

// ---------- Moderation ----------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = buildFilters(req);
  const search = buildSearch(req.query.q, [
    'name',
    'email',
    'countryCode',
    'month',
    'duration',
    'destination',
    'source',
    'comment',
  ]);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Lead.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Lead.countDocuments(where),
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
  if (!isObjectId(id)) return notFound(res, 'Invalid id');
  const doc = await Lead.findById(id).lean();
  if (!doc) return notFound(res, 'Lead not found');
  return ok(res, doc);
});

exports.create = asyncHandler(async (req, res) => {
  // 1️⃣ Validate input
  const schema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().required(),
    contact: Joi.string().min(5).max(20).required(),
    countryCode: Joi.string().min(1).max(6).required(),
    month: Joi.string().max(100).allow(''),
    year: Joi.number().max(3030).allow(null, ''),
    duration: Joi.string().max(120).allow(''),
    people: Joi.number().min(1).max(500).required(),
    budget: Joi.number().min(1).max(9999999999).allow(null, ''),
    comment: Joi.string().min(0).max(999).allow(''),
    destination: Joi.string().allow(''),
    source: Joi.string().allow(''),
    status: Joi.string().valid('published', 'draft').default('draft'),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return fail(res, error.details[0].message, 400);

  // 2️⃣ Build payload (secure)
  const payload = {
    ...value,
    createdBy: req.user?._id,
  };

  // 3️⃣ Create lead
  const doc = await Lead.create(payload);

  // 4️⃣ Send attachment email if applicable
  const filePath = path.join(process.cwd(), 'uploads', 'current.pdf');
  const hasFile = fs.existsSync(filePath);

  try {
    await sendMail({
      to: doc.email,
      name: doc.name,
      template: 'ATTACHMENT',
      data: doc,
      attachments: hasFile
        ? [
            {
              filename: 'current.pdf',
              path: filePath,
            },
          ]
        : undefined,
    });
  } catch (err) {
    console.error('Lead email send failed:', err.message);
  }

  // 5️⃣ Respond
  return created(res, doc.toObject());
});

exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const updates = { ...req.body };
  if ('createdBy' in updates) delete updates.createdBy;

  const doc = await Lead.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();
  if (!doc) return notFound(res, 'Lead not found');
  return ok(res, doc);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');
  const { status } = req.body || {};
  if (!['draft', 'published', 'rejected'].includes(status)) {
    return fail(res, 'Invalid status', 400);
  }
  const doc = await Lead.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) return notFound(res, 'Lead not found');
  return ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');
  const doc = await Lead.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, 'Lead not found');
  return ok(res, { id });
});

// ---------- Duplicate Lead ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const original = await Lead.findById(id).lean();
  if (!original) return notFound(res, 'Lead not found');

  // Prepare duplicated data
  const duplicatedData = {
    ...original,
    _id: undefined, // remove original ID
    name: original.name ? `${original.name} (Copy)` : 'Untitled (Copy)',
    status: 'draft', // default new duplicate to draft
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const duplicate = await Lead.create(duplicatedData);

  return created(res, {
    message: 'Lead duplicated successfully',
    duplicate,
  });
});
