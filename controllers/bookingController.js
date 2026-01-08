// controllers/booking.controller.js
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const {
  ok,
  created,
  fail,
  notFound,
  asyncHandler,
} = require('../utils/respond');
const {
  parsePagination,
  buildSearch,
  latestSort,
  applyDateRange,
  coerceId,
} = require('../utils/query');
const { sendMail } = require('../utils/mailer');
const { sendSms } = require('../utils/smsaleart');

const trimString = (val) => (typeof val === 'string' ? val.trim() : '');
const normalizeEmail = (val) => trimString(val).toLowerCase();
const countWords = (val = '') =>
  trimString(val) ? trimString(val).split(/\s+/).filter(Boolean).length : 0;
const validateCancellationReason = (reason) => {
  const normalized = trimString(reason);
  if (!normalized) {
    return { ok: false, message: 'Cancellation reason is required' };
  }
  if (countWords(normalized) > 500) {
    return {
      ok: false,
      message: 'Cancellation reason must be 500 words or fewer',
    };
  }
  return { ok: true, value: normalized };
};
const escapeHtml = (value = '') =>
  String(value || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });

const buildBookingFilters = (req) => {
  const f = {};

  if (req.query.status) f.status = req.query.status;

  if (req.query.paymentMode) {
    f['payment.paymentMode'] = req.query.paymentMode;
  }

  if (req.query.paymentStatus) {
    f['payment.paymentStatus'] = req.query.paymentStatus;
  }

  if (req.query.user) {
    const id = coerceId(req.query.user);
    if (id) f.user = id;
  }

  if (req.query.tour) {
    const id = coerceId(req.query.tour);
    if (id) f.tour = id;
  }

  // Date range (createdAt)
  applyDateRange(f, req, 'createdAt');

  return f;
};
async function saveSmsFlag(booking, flag) {
  booking.smsFlags[flag] = true;
  booking.markModified('smsFlags');
  await booking.save();
}

exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);

  // 🔍 Search across meaningful booking fields
  const search = buildSearch(req.query.q, [
    'tourName',
    'contactInfo.name',
    'contactInfo.email',
    'contactInfo.phone',
  ]);

  const filters = buildBookingFilters(req);

  const where = { ...(filters || {}) };
  if (search) Object.assign(where, search);

  // 🔐 Optional role-based scoping (future-proof)
  const role = (req.user?.roleName || req.user?.role || '').toLowerCase();
  if (role === 'agent' || role === 'staff') {
    // Example: only see their own bookings
    // where.createdBy = req.user._id;
  }

  const [items, total] = await Promise.all([
    Booking.find(where)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('tour', 'title slug')
      .populate('user', 'name email')
      .lean(),

    Booking.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// controllers/booking.controller.js
exports.create = asyncHandler(async (req, res) => {
  const body = req.body;
  const userId = req.user?._id || body.user;

  if (!body.tour || !body.startDate || !body.endDate) {
    return fail(res, 'Missing required fields', 400);
  }

  /* --------------------------------------------------
     1️⃣ TOUR & PRICE (BACKEND AUTHORITY)
  -------------------------------------------------- */
  const tourDoc = await Tour.findById(body.tour).lean();
  if (!tourDoc) return notFound(res, 'Tour not found');

  const tourName = tourDoc.title;
  const pricePerPerson = tourDoc.details?.pricePerPerson;
  if (!pricePerPerson) return fail(res, 'Invalid tour price', 400);

  /* --------------------------------------------------
     2️⃣ GUEST COUNT
  -------------------------------------------------- */
  const adults =
    Number(body.guests?.adults ?? body.adults ?? body.guests ?? 0) || 0;
  const children = Number(body.guests?.children ?? body.children ?? 0) || 0;

  let totalPersons =
    Number(body.totalPersons) ||
    Number(body.guests?.total || body.guests?.count || 0) ||
    adults + children;

  if (!totalPersons || totalPersons <= 0) {
    return fail(res, 'Invalid guest count', 400);
  }

  /* --------------------------------------------------
     3️⃣ CONTACT SNAPSHOT
  -------------------------------------------------- */
  const contactInfo = {
    name: trimString(body.contactInfo?.name) || trimString(req.user?.name),
    email:
      normalizeEmail(body.contactInfo?.email) ||
      normalizeEmail(req.user?.email),
    phone: trimString(
      body.contactInfo?.phone ||
        body.contactInfo?.number ||
        req.user?.phone ||
        '',
    ),
  };

  const snapshotContact = {
    name: contactInfo.name,
    email: contactInfo.email,
    ...(contactInfo.phone ? { phone: contactInfo.phone } : {}),
  };

  /* --------------------------------------------------
     4️⃣ PAYMENT CONFIG (STORE ONLY, NO MONEY YET)
  -------------------------------------------------- */
  const totalAmount = pricePerPerson * totalPersons;

  const paymentMode =
    body.payment?.paymentMode === 'partial' ? 'partial' : 'full';

  let partialAmount = null;

  if (paymentMode === 'partial') {
    if (!body.payment?.partialAmount || body.payment.partialAmount <= 0) {
      return fail(res, 'Partial amount not configured', 400);
    }

    if (body.payment.partialAmount >= totalAmount) {
      return fail(res, 'Partial amount must be less than total', 400);
    }

    partialAmount = Number(body.payment.partialAmount);
  }

  /* --------------------------------------------------
     5️⃣ CREATE BOOKING (PAYMENT = PENDING)
  -------------------------------------------------- */
  const booking = await Booking.create({
    tour: body.tour,
    tourName,
    user: userId,

    startDate: body.startDate,
    endDate: body.endDate,

    guests: {
      adults,
      children,
    },
    totalPersons,
    contactInfo: snapshotContact,

    status: 'pending',

    invoiceId: undefined, // will auto-generate in model pre-save

    payment: {
      paymentMode,
      totalAmount,
      partialAmount,
      amountPaid: 0,
      remainingAmount: totalAmount,
      paymentStatus: 'pending',
      gateway: 'razorpay',
    },
  });

  // Send confirmation mail if created directly as confirmed (dashboard flow)
  if (booking.status === 'confirmed') {
    // 🔔 SMS: Admin-created confirmed booking
    const phone = booking.contactInfo?.phone;

    if (phone && !booking.smsFlags.bookingConfirmedSent) {
      await sendSms(phone, 'BOOKING_CONFIRM', [booking.bookingId, 'Confirmed']);
      await saveSmsFlag(booking, 'bookingConfirmedSent');
    }

    if (
      phone &&
      booking.payment?.paymentStatus &&
      booking.payment.paymentStatus !== 'pending' &&
      !booking.smsFlags.paymentStatusSent
    ) {
      await sendSms(phone, 'PAYMENT_UPDATE', [
        booking.bookingId,
        booking.payment.paymentStatus,
      ]);
      await saveSmsFlag(booking, 'paymentStatusSent');
    }
    const recipientEmail =
      booking.contactInfo?.email || booking.user?.email || req.user?.email;
    const recipientName =
      booking.contactInfo?.name ||
      booking.user?.name ||
      req.user?.name ||
      'Guest';
    const isPaid = booking.payment.paymentStatus === 'paid';
    if (recipientEmail) {
      await sendMail({
        to: recipientEmail,
        name: recipientName,
        template: isPaid
          ? 'BOOKING_CONFIRMED_FULL'
          : 'BOOKING_CONFIRMED_PARTIAL',
        data: {
          tourName: booking.tourName,
          amountPaid: booking.payment.amountPaid,
          remainingAmount: booking.payment.remainingAmount,
        },
      });
    }
  }

  return created(res, booking);
});

// List bookings for current user
exports.listMine = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);

  const where = {
    user: req.user._id,
    'payment.paymentStatus': { $in: ['paid', 'partial'] },
  };

  const [items, total] = await Promise.all([
    Booking.find(where)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('-__v')
      .populate('tour', 'slug title place heroImg')
      .lean(),
    Booking.countDocuments(where),
  ]);

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

exports.cancelBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reasonInput = req.body?.reason ?? req.body?.cancellationReason;

  const validation = validateCancellationReason(reasonInput);
  if (!validation.ok) return fail(res, validation.message, 400);

  const booking = await Booking.findById(id).populate('user', 'name email');
  if (!booking) return notFound(res, 'Booking not found');

  const hadPayment = !!booking.payment;
  if (!booking.payment) {
    booking.payment = {
      paymentMode: 'full',
      totalAmount: 0,
      partialAmount: null,
      amountPaid: 0,
      remainingAmount: 0,
      paymentStatus: 'pending',
      currency: 'INR',
      gateway: 'razorpay',
    };
  }

  const role = (req.user?.roleName || req.user?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin';
  const bookingUserId = booking.user?._id || booking.user;
  const isOwner =
    bookingUserId &&
    req.user?._id &&
    String(bookingUserId) === String(req.user._id);
  const emailMatch =
    booking.contactInfo?.email &&
    req.user?.email &&
    booking.contactInfo.email.toLowerCase() ===
      String(req.user.email).toLowerCase();

  if (!isAdmin && !isOwner && !emailMatch) {
    return fail(res, 'You are not allowed to cancel this booking', 403);
  }

  if (booking.status === 'cancelled') {
    return fail(res, 'Booking is already cancelled', 400);
  }

  const hasPayment = hadPayment || !!booking.payment;
  const hasPaid = Number(booking.payment?.amountPaid ?? 0) > 0;

  booking.status = 'cancelled';
  booking.cancellationReason = validation.value;
  booking.cancelledAt = new Date();

  if (hasPayment) {
    booking.payment.paymentStatus = hasPaid ? 'refund_pending' : 'cancelled';
  }

  await booking.save();
  // 🔔 SMS: Booking cancelled

  const phone = booking.contactInfo?.phone;

  if (phone && !booking.smsFlags.bookingConfirmedSent) {
    await sendSms(phone, 'BOOKING_CONFIRM', [booking.bookingId, 'Cancelled']);
    await saveSmsFlag(booking, 'bookingConfirmedSent');
  }
  const recipientEmail = booking.contactInfo?.email || booking.user?.email;
  const recipientName =
    booking.contactInfo?.name || booking.user?.name || 'Guest';
  const safeReason =
    escapeHtml(booking.cancellationReason || '') || 'Not provided';

  if (recipientEmail) {
    await sendMail({
      to: recipientEmail,
      name: recipientName,
      template: 'BOOKING_CANCELLED',
      data: {
        tourName: booking.tourName,
        cancellationReason: safeReason,
      },
    });
  }

  const doc = await Booking.findById(id)
    .populate('tour', 'title slug')
    .populate('user', 'name email')
    .lean();

  return ok(res, doc);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, refundAmount, refundNote, isRefunded } = req.body;
  const cancellationInput = req.body?.cancellationReason ?? req.body?.reason;

  if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
    return fail(res, 'Invalid status', 400);
  }

  const booking = await Booking.findById(id).populate('user', 'name email');
  if (!booking) return notFound(res, 'Booking not found');

  const hadPayment = !!booking.payment;
  if (!booking.payment) {
    booking.payment = {
      paymentMode: 'full',
      totalAmount: 0,
      partialAmount: null,
      amountPaid: 0,
      remainingAmount: 0,
      paymentStatus: 'pending',
      currency: 'INR',
      gateway: 'razorpay',
    };
  }

  const prevStatus = booking.status;
  const prevPaymentStatus = booking.payment?.paymentStatus;

  let cancellationReason;
  if (status === 'cancelled') {
    const validation = validateCancellationReason(
      cancellationInput ?? booking.cancellationReason,
    );
    if (!validation.ok) return fail(res, validation.message, 400);
    cancellationReason = validation.value;
  }

  booking.status = status;

  const hasPayment = hadPayment || !!booking.payment;
  const hasPaid = Number(booking.payment?.amountPaid ?? 0) > 0;

  if (hasPayment) {
    booking.payment.paymentStatus =
      status === 'cancelled'
        ? hasPaid
          ? 'refund_pending'
          : 'cancelled'
        : status === 'confirmed'
        ? booking.payment.paymentStatus === 'failed'
          ? 'pending'
          : booking.payment.paymentStatus || 'paid'
        : 'pending';
  }

  if (status === 'cancelled') {
    booking.cancellationReason = cancellationReason;
    booking.cancelledAt = booking.cancelledAt || new Date();
    booking.refundInfo = {
      amount:
        refundAmount !== undefined && refundAmount !== null
          ? Number(refundAmount)
          : booking.refundInfo?.amount || 0,
      isRefunded: !!isRefunded,
      refundedAt: isRefunded ? new Date() : null,
      note: refundNote || booking.refundInfo?.note || '',
    };

    if (hasPayment) {
      booking.payment.paymentStatus = isRefunded
        ? 'refunded'
        : hasPaid
        ? 'refund_pending'
        : 'cancelled';
    }
    booking.status = 'cancelled';
  }

  await booking.save();
  const phone = booking.contactInfo?.phone;

  // Booking confirmed SMS
  if (
    phone &&
    booking.status === 'confirmed' &&
    !booking.smsFlags.bookingConfirmedSent
  ) {
    await sendSms(phone, 'BOOKING_CONFIRM', [booking.bookingId, 'Confirmed']);
    await saveSmsFlag(booking, 'bookingConfirmedSent');
  }

  // Payment update SMS
  if (
    phone &&
    prevPaymentStatus !== booking.payment.paymentStatus &&
    !booking.smsFlags.paymentStatusSent &&
    !(
      prevPaymentStatus === 'partial' &&
      booking.payment.paymentStatus === 'paid'
    )
  ) {
    await sendSms(phone, 'PAYMENT_UPDATE', [
      booking.bookingId,
      booking.payment.paymentStatus,
    ]);
    await saveSmsFlag(booking, 'paymentStatusSent');
  }

  // Invoice SMS (eligibility based)
  const wasEligibleBefore =
    prevStatus === 'confirmed' ||
    ['partial', 'paid'].includes(prevPaymentStatus);

  const isEligibleNow =
    booking.status === 'confirmed' ||
    ['partial', 'paid'].includes(booking.payment.paymentStatus);

  if (
    phone &&
    booking.invoiceId &&
    !wasEligibleBefore &&
    isEligibleNow &&
    !booking.smsFlags.invoiceSent
  ) {
    await sendSms(phone, 'INVOICE', [booking.bookingId, booking.invoiceId]);
    await saveSmsFlag(booking, 'invoiceSent');
  }

  const recipientEmail = booking.contactInfo?.email || booking.user?.email;
  const recipientName =
    booking.contactInfo?.name || booking.user?.name || 'Guest';
  const safeReason =
    escapeHtml(booking.cancellationReason || '') || 'Not provided';

  // Status-based emails
  if (prevStatus !== booking.status && recipientEmail) {
    if (booking.status === 'confirmed') {
      const isPaid = booking.payment.paymentStatus === 'paid';
      await sendMail({
        to: recipientEmail,
        name: recipientName,
        template: isPaid
          ? 'BOOKING_CONFIRMED_FULL'
          : 'BOOKING_CONFIRMED_PARTIAL',
        data: {
          tourName: booking.tourName,
          amountPaid: booking.payment.amountPaid,
          remainingAmount: booking.payment.remainingAmount,
        },
      });
    } else if (booking.status === 'cancelled') {
      await sendMail({
        to: recipientEmail,
        name: recipientName,
        template: 'BOOKING_CANCELLED',
        data: {
          tourName: booking.tourName,
          cancellationReason: safeReason,
        },
      });
    }
  }

  // Refund completion email
  if (
    prevPaymentStatus !== booking.payment.paymentStatus &&
    booking.payment.paymentStatus === 'refunded' &&
    recipientEmail
  ) {
    await sendMail({
      to: recipientEmail,
      name: recipientName,
      template: 'PAYMENT_REFUND_COMPLETED',
      data: {
        tourName: booking.tourName,
        refundAmount: booking.refundInfo?.amount || 0,
      },
    });
  }

  // 🔔 FINAL PAYMENT COMPLETED SMS (partial → paid)
  if (
    phone &&
    prevPaymentStatus === 'partial' &&
    booking.payment.paymentStatus === 'paid' &&
    !booking.smsFlags.paymentCompletedSent
  ) {
    await sendSms(phone, 'PAYMENT_UPDATE', [
      booking.bookingId,
      'Payment completed successfully',
    ]);

    booking.smsFlags.paymentCompletedSent = true;
    booking.markModified('smsFlags');
    await booking.save();
  }

  const doc = await Booking.findById(id)
    .populate('tour', 'title slug')
    .populate('user', 'name email')
    .lean();

  return ok(res, doc);
});
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await Booking.findById(req.params.id)
    .populate('tour')
    .populate('user', 'name email');

  if (!doc) return notFound(res, 'Booking not found');
  return ok(res, {
    ...doc.toJSON(),
    tour: doc.tour?._id || doc.tour,
    user: doc.user?._id || doc.user,
  });
});
exports.getModeratedOne = asyncHandler(async (req, res) => {
  const doc = await Booking.findById(req.params.id)
    .populate('tour', 'title slug')
    .populate('user', 'name email');

  if (!doc) return notFound(res, 'Booking not found');
  return ok(res, {
    ...doc.toJSON(),
    tour: doc.tour?._id || doc.tour,
    user: doc.user?._id || doc.user,
  });
});
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  console.log('Direct update booking:', id, body);

  if (!id) return notFound(res, 'Invalid booking id');

  const booking = await Booking.findById(id);
  if (!booking) return notFound(res, 'Booking not found');

  const prevStatus = booking.status;
  const prevPaymentStatus = booking.payment?.paymentStatus;

  const role = (req.user?.roleName || req.user?.role || '').toLowerCase();
  const isAdmin =
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'moderator' ||
    role === 'manager' ||
    role === 'staff' ||
    role === 'dev' ||
    role.toLowerCase() === 'developer';

  // 🔒 Ownership / permission check
  if (!isAdmin && String(booking.user) !== String(req.user._id)) {
    return fail(res, 'You are not allowed to update this booking', 403);
  }

  // 🚫 HARD BLOCK: Never allow user change
  delete body.user;
  delete body._id;
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;

  if (!isAdmin) {
    // Optional: restrict user updates
    delete body.payment;
    delete body.bookingStatus;
    delete body.status;
  }

  // If guests are updated, refresh totalPersons
  if (body.guests) {
    const a = Number(body.guests?.adults ?? 0) || 0;
    const c = Number(body.guests?.children ?? 0) || 0;
    const total = Number(body.totalPersons) || a + c;
    if (total > 0) {
      body.totalPersons = total;
      body.guests = { adults: a, children: c };
    }
  }

  // Validate cancellation reason if provided
  if (body.cancellationReason) {
    const validation = validateCancellationReason(body.cancellationReason);
    if (!validation.ok) return fail(res, validation.message, 400);
    body.cancellationReason = validation.value;
  }

  // Sanitize contactInfo if present
  if (body.contactInfo) {
    if (body.contactInfo.name) body.contactInfo.name = trimString(body.contactInfo.name);
    if (body.contactInfo.email) body.contactInfo.email = normalizeEmail(body.contactInfo.email);
    if (body.contactInfo.phone) body.contactInfo.phone = trimString(body.contactInfo.phone);
  }

  // Merge payment instead of replacing
  if (body.payment) {
    booking.payment = {
      ...(booking.payment?.toObject
        ? booking.payment.toObject()
        : booking.payment || {}),
      ...body.payment,
    };
    booking.markModified('payment');
    delete body.payment;
  }

  booking.set(body);
  await booking.save();
  const phone = booking.contactInfo?.phone;

  // Admin status change
  if (
    phone &&
    prevStatus !== booking.status &&
    ['confirmed', 'cancelled'].includes(booking.status) &&
    !booking.smsFlags.bookingConfirmedSent
  ) {
    await sendSms(phone, 'BOOKING_CONFIRM', [
      booking.bookingId,
      booking.status,
    ]);
    await saveSmsFlag(booking, 'bookingConfirmedSent');
  }

  // Admin payment update
  if (
    phone &&
    prevPaymentStatus !== booking.payment.paymentStatus &&
    !booking.smsFlags.paymentStatusSent &&
    !(
      prevPaymentStatus === 'partial' &&
      booking.payment.paymentStatus === 'paid'
    )
  ) {
    await sendSms(phone, 'PAYMENT_UPDATE', [
      booking.bookingId,
      booking.payment.paymentStatus,
    ]);
    await saveSmsFlag(booking, 'paymentStatusSent');
  }

  // Invoice eligibility
  const wasEligibleBefore =
    prevStatus === 'confirmed' ||
    ['partial', 'paid'].includes(prevPaymentStatus);

  const isEligibleNow =
    booking.status === 'confirmed' ||
    ['partial', 'paid'].includes(booking.payment.paymentStatus);

  if (
    phone &&
    booking.invoiceId &&
    !wasEligibleBefore &&
    isEligibleNow &&
    !booking.smsFlags.invoiceSent
  ) {
    await sendSms(phone, 'INVOICE', [booking.bookingId, booking.invoiceId]);
    await saveSmsFlag(booking, 'invoiceSent');
  }

  // 🔔 FINAL PAYMENT COMPLETED SMS (partial → paid)
  if (
    phone &&
    prevPaymentStatus === 'partial' &&
    booking.payment.paymentStatus === 'paid' &&
    !booking.smsFlags.paymentCompletedSent
  ) {
    await sendSms(phone, 'PAYMENT_UPDATE', [
      booking.id,
      'Payment completed successfully',
    ]);

    booking.smsFlags.paymentCompletedSent = true;
    booking.markModified('smsFlags');
    await booking.save();
  }

  const updated = await Booking.findById(id)
    .populate('tour', 'title slug')
    .populate('user', 'name email')
    .lean();

  return ok(res, updated);
});

exports.remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log('Delete booking request for id:', id);
  // 🔒 Validate ObjectId
  if (!id) {
    return notFound(res, 'Invalid booking id');
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    return notFound(res, 'Booking not found');
  }

  /**
   * OPTIONAL RULE (recommended):
   * - User can delete ONLY their own booking
   * - Admin can delete any booking
   */
  const role = (req.user?.roleName || req.user?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin';

  if (!isAdmin && String(booking.user) !== String(req.user._id)) {
    return fail(res, 'You are not allowed to delete this booking', 403);
  }

  await booking.deleteOne();

  return ok(res, {
    message: 'Booking deleted successfully',
    id,
  });
});
