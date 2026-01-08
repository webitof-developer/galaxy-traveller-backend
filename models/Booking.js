// models/Booking.js
const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  paymentMode: {
    type: String,
    enum: ['full', 'partial'],
    required: true,
  },

  totalAmount: {
    type: Number,
    required: true, // rupees
  },

  partialAmount: {
    type: Number, // rupees (admin-defined)
    default: null,
  },

  amountPaid: {
    type: Number,
    default: 0, // rupees
  },

  remainingAmount: {
    type: Number,
    default: 0, // rupees
  },

  paymentStatus: {
    type: String,
    enum: [
      'pending',
      'partial',
      'paid',
      'failed',
      'refund_pending',
      'refunded',
      'cancelled',
    ],
    default: 'pending',
  },

  currency: { type: String, default: 'INR' },
  gateway: { type: String, default: 'razorpay' },

  razorpay: {
    orderId: String,
    paymentId: String,
    signature: String,
  },

  isVerified: { type: Boolean, default: false },
});

const generateInvoiceId = () =>
  `INV_${(
    Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  ).toUpperCase()}`;
const generateBookingId = () =>
  `BKID_${(
    Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  ).toUpperCase()}`;

const BookingSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tour',
      required: true,
      index: true,
    },

    // ✅ SNAPSHOT FIELD
    tourName: {
      type: String,
      required: true,
      trim: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    guests: {
      adults: { type: Number, default: 0 },
      children: { type: Number, default: 0 },
    },

    totalPersons: {
      type: Number,
      required: true,
      min: 1,
    },

    contactInfo: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
    },

    invoiceId: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
    },

    bookingId: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
    },

    payment: PaymentSchema,

    refundInfo: {
      amount: { type: Number, default: 0 },
      isRefunded: { type: Boolean, default: false },
      refundedAt: { type: Date, default: null },
      note: { type: String, trim: true },
    },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 4000, // ~500 words
      validate: {
        validator: function (val) {
          if (!val) return true;
          const words = val.trim().split(/\s+/).filter(Boolean);
          return words.length <= 500;
        },
        message: 'Cancellation reason must be 500 words or fewer.',
      },
    },
    smsFlags: {
      bookingConfirmedSent: { type: Boolean, default: false },
      paymentStatusSent: { type: Boolean, default: false },
      invoiceSent: { type: Boolean, default: false },
      paymentCompletedSent: { type: Boolean, default: false },
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    // ✅ BOOKING lifecycle status

    // createdByAdmin: {
    //   type: Boolean,
    //   default: false,
    // },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  },
);

BookingSchema.pre('save', function (next) {
  // keep totalPersons aligned with guests breakdown when available
  const adults = Number(this.guests?.adults || 0);
  const children = Number(this.guests?.children || 0);
  const sum = adults + children;
  if (sum > 0 && (!this.totalPersons || this.totalPersons < sum)) {
    this.totalPersons = sum;
  }
  if (!this.invoiceId) {
    this.invoiceId = generateInvoiceId();
  }
  if (!this.bookingId) {
    this.bookingId = generateBookingId();
  }
  next();
});

BookingSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  const guests = update.guests || {};
  const adults = Number(guests.adults || 0);
  const children = Number(guests.children || 0);
  const sum = adults + children;
  const totalProvided = Number(update.totalPersons || 0);
  if (sum > 0 && (!totalProvided || totalProvided < sum)) {
    update.totalPersons = sum;
    this.setUpdate(update);
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
