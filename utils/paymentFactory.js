// services/payments/payment.factory.js
const PaymentGateway = require('../models/PaymentGateway');
const razorpayService = require('./razorpay');

exports.createPayment = async ({ gatewayKey, payload }) => {
  if (gatewayKey !== 'razorpay') {
    throw new Error('Only Razorpay is supported currently');
  }

  const gateway = await PaymentGateway.findOne({
    key: 'razorpay',
    isActive: true,
  }).lean();

  const credentials = gateway?.credentials?.keyId
    ? {
        keyId: gateway.credentials.keyId,
        keySecret: gateway.credentials.keySecret,
      }
    : {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_SECRET,
      };

  if (!credentials.keyId || !credentials.keySecret) {
    throw new Error('Razorpay credentials not configured');
  }

  const order = await razorpayService.createOrder({
    amount: payload.amount, // rupees
    currency: payload.currency,
    receipt: payload.receipt,
    notes: payload.notes,
    config: credentials,
  });

  return {
    id: order.id,
    amount: order.amount, // paise (from Razorpay)
    currency: order.currency,
    key: credentials.keyId,
  };
};
