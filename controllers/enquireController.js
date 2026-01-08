const Enquiry = require('../models/Enquire');
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

const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const { sendMail } = require('../utils/mailer');

// Build filters for moderation queries
const buildFilters = (req) => {
  const f = {};
  if (req.query.status) f.status = req.query.status;
  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }
  // Apply date range filter (by startDate)
  applyDateRange(f, req, 'startDate');
  return f;
};

// ---------- Public ----------

exports.create = asyncHandler(async (req, res) => {
  // 1️⃣ Validate
  const schema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().min(5).max(20).required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    adults: Joi.number().min(0).default(0),
    children: Joi.number().min(0).default(0),
    totalPeople: Joi.number().min(1).optional(),
    totalPrice: Joi.number().min(0).optional(),
    tour: Joi.string().optional(),
    tourCreatedBy: Joi.string().optional(),
    status: Joi.string().valid('published', 'draft').default('draft'),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return fail(res, error.details[0].message, 400);

  // 2️⃣ Derive people count
  const people =
    value.totalPeople || (value.adults || 0) + (value.children || 0);

  // 3️⃣ Create sanitized payload
  const payload = {
    ...value,
    totalPeople: people,
    tourCreatedBy: value.tourCreatedBy || req.user?._id,
    createdBy: req.user?._id,
  };

  // 4️⃣ Save enquiry
  const doc = await Enquiry.create(payload);

  // 5️⃣ Send email with attachment (if exists)
  const filePath = path.join(process.cwd(), 'uploads', 'current.pdf');
  const hasFile = fs.existsSync(filePath);

  // 6️⃣ Respond
  return created(res, doc.toObject());
});

// ---------- Moderation ----------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);
  const where = buildFilters(req);

  if ((req.user?.roleName || req.user?.role) == 'creator') {
    where.tourCreatedBy = req.user._id;
  }
  const search = buildSearch(req.query.q, ['name', 'email', 'phone']);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Enquiry.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Enquiry.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

exports.getOne = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');
  const doc = await Enquiry.findById(id).lean();
  if (!doc) return notFound(res, 'Enquiry not found');
  return ok(res, doc);
});

exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const doc = await Enquiry.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  }).lean();
  if (!doc) return notFound(res, 'Enquiry not found');
  return ok(res, doc);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'cancelled'].includes(status))
    return fail(res, 'Invalid status', 400);

  const doc = await Enquiry.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true },
  ).lean();

  if (!doc) return notFound(res, 'Enquiry not found');
  return ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const doc = await Enquiry.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, 'Enquiry not found');
  return ok(res, { id });
});

// -------- My Enquiries --------
exports.listMyEnquiries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);

  // filter by logged-in tour creator
  const where = { tourCreatedBy: req.user._id, ...buildFilters(req) };

  const search = buildSearch(req.query.q, ['name', 'email', 'phone']);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Enquiry.find(where)
      .populate('tour', 'title slug') // optional populate tour info
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Enquiry.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// ---------- Duplicate Enquiry ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const original = await Enquiry.findById(id).lean();
  if (!original) return notFound(res, 'Enquiry not found');

  // Prepare duplicated data
  const duplicatedData = {
    ...original,
    _id: undefined, // remove original ID
    name: original.name ? `${original.name} (Copy)` : 'Untitled (Copy)',
    status: 'pending', // default new duplicate to pending
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const duplicate = await Enquiry.create(duplicatedData);

  return created(res, {
    message: 'Enquiry duplicated successfully',
    duplicate,
  });
});

exports.sendOtp = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().min(5).required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    adults: Joi.number().min(0).default(0),
    children: Joi.number().min(0).default(0),
    totalPrice: Joi.number().min(0).optional(),
    tour: Joi.string().optional(),
    tourCreatedBy: Joi.string().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return fail(res, error.details[0].message, 400);

  const otp = generateOTP();

  const enquiry = await Enquiry.create({
    ...value,
    otp,
    otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
    isVerified: false,
    status: 'draft',
  });

  // 🔔 Send OTP (email example – phone SMS can be added later)
  await sendMail({
    to: value.email,
    name: value.name,
    template: 'OTP',
    data: { otp },
  });

  return ok(res, {
    enquiryId: enquiry._id,
    message: 'OTP sent successfully',
  });
});

exports.verifyOtpAndCreate = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    enquiryId: Joi.string().required(),
    otp: Joi.string().length(6).required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return fail(res, error.details[0].message, 400);

  const enquiry = await Enquiry.findById(value.enquiryId);
  if (!enquiry) return fail(res, 'Enquiry not found', 404);

  if (enquiry.isVerified) {
    return fail(res, 'Enquiry already verified', 400);
  }

  if (isOTPExpired(enquiry.otpExpiresAt)) {
    return fail(res, 'OTP expired', 400);
  }

  if (enquiry.otp !== value.otp) {
    return fail(res, 'Invalid OTP', 400);
  }

  // ✅ OTP VERIFIED
  enquiry.isVerified = true;
  enquiry.otp = undefined;
  enquiry.otpExpiresAt = undefined;
  enquiry.status = 'published';
  await enquiry.save();

  // 📎 Send final enquiry mail
  const filePath = path.join(process.cwd(), 'uploads', 'current.pdf');
  const hasFile = fs.existsSync(filePath);

  await sendMail({
    to: enquiry.email,
    name: enquiry.name,
    template: 'ATTACHMENT',
    data: enquiry,
    attachments: hasFile ? [{ path: filePath }] : undefined,
  });

  return created(res, enquiry.toObject());
});
