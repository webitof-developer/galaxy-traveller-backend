const Contact = require('../models/Contact');
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
const Joi = require('joi');
const path = require('path');
const fs = require('fs');
const { sendMail } = require('../utils/mailer');

// Build filters from query
const buildFilters = (req) => {
  const f = {};
  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  applyDateRange(f, req, 'createdAt');
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
    delete updateData[subSchemaKey]; // Remove the full sub-schema to avoid conflict
  }
}

// ---------- Public ----------

exports.listPublished = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = { status: 'published', ...buildFilters(req) };
  const search = buildSearch(req.query.q, ['name', 'email']);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Contact.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Contact.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = String(req.params.idOrSlug || '');
  const where = isObjectId(p) ? { _id: p } : { name: p };
  const doc = await Contact.findOne(where).lean();
  if (!doc) return notFound(res, 'Contact not found');
  return ok(res, doc);
});

// ---------- Moderation ----------

exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = buildFilters(req);
  const search = buildSearch(req.query.q, ['name', 'email']);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Contact.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Contact.countDocuments(where),
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
  const doc = await Contact.findById(id).lean();
  if (!doc) return notFound(res, 'Contact not found');
  return ok(res, doc);
});

exports.create = asyncHandler(async (req, res) => {
  // 1️⃣ Validate
  const schema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().required(),
    contact: Joi.string().required(),
    requirement: Joi.string().min(1).max(999).required(),
    status: Joi.string().valid('published', 'draft').default('draft'),
  });
  console.log(req.body);
  const { error, value } = schema.validate(req.body);
  if (error) return fail(res, error.details[0].message, 400);

  // 2️⃣ Create sanitized payload
  const payload = {
    ...value,
    createdBy: req.user?._id,
  };

  // 3️⃣ Save
  const doc = await Contact.create(payload);

  // 4️⃣ Send email with attachment (if file exists)
  const filePath = path.join(process.cwd(), 'uploads', 'current.pdf');
  const hasFile = fs.existsSync(filePath);

  try {
    await sendMail({
      to: doc.email,
      name: doc.name,
      template: 'ATTACHMENT',
      data: { name: doc.name },
      attachmentPath: hasFile ? filePath : null,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  return created(res, doc.toObject());
});

exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const updates = { ...req.body };
  const doc = await Contact.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!doc) return notFound(res, 'Contact not found');
  return ok(res, doc);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');
  const { status } = req.body || {};
  if (!['draft', 'published', 'rejected'].includes(status)) {
    return fail(res, 'Invalid status', 400);
  }
  const doc = await Contact.findByIdAndUpdate(
    id,
    { status },
    {
      new: true,
      runValidators: true,
    },
  ).lean();
  if (!doc) return notFound(res, 'Contact not found');
  return ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');
  const doc = await Contact.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, 'Contact not found');
  return ok(res, { id });
});

// ---------- Duplicate Contact ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const original = await Contact.findById(id).lean();
  if (!original) return notFound(res, 'Contact not found');

  // Prepare duplicated data
  const duplicatedData = {
    ...original,
    _id: undefined, // remove original ID
    name: original.name ? `${original.name} (Copy)` : 'Untitled (Copy)',
    status: 'draft', // new duplicate starts as draft
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const duplicate = await Contact.create(duplicatedData);

  return created(res, {
    message: 'Contact duplicated successfully',
    duplicate,
  });
});
