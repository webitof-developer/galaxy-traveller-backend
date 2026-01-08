// models/PaymentTransaction.js
const mongoose = require('mongoose');

const PaymentTransactionSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },

    gateway: {
      type: String,
      enum: ['razorpay'],
      required: true,
    },

    orderId: { type: String, required: true, index: true },
    paymentId: { type: String, required: true, unique: true }, // 🔒 IDENTITY
    signature: { type: String, required: true },

    amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ['captured', 'failed'],
      required: true,
    },

    raw: Object,
  },
  { timestamps: true },
);

module.exports = mongoose.model('PaymentTransaction', PaymentTransactionSchema);
