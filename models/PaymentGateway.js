// models/PaymentGateway.js
const mongoose = require("mongoose");

const paymentGatewaySchema = new mongoose.Schema(
  {
    name: {
      type: String, // "Razorpay", "Stripe"
      required: true,
      trim: true,
    },

    key: {
      type: String, // razorpay | stripe | paypal
      required: true,
      lowercase: true,
      unique: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    credentials: {
      type: Object,
      default: {},
      /*
        Razorpay:
        {
          keyId: "...",
          keySecret: "...",
          webhookSecret: "..."
        }

        Stripe:
        {
          publishableKey: "...",
          secretKey: "...",
          webhookSecret: "..."
        }
      */
    },

    supportedCurrencies: {
      type: [String],
      default: ["INR"],
    },

    supportedMethods: {
      type: [String], // card, upi, netbanking
      default: [],
    },

    mode: {
      type: String,
      enum: ["test", "live"],
      default: "test",
    },

    meta: {
      type: Object,
      default: {}, // extra configs from dashboard
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentGateway", paymentGatewaySchema);
