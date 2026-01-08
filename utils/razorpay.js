// services/payments/razorpay.service.js
const Razorpay = require('razorpay');

exports.createRazorpayClient = (config) => {
  return new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret,
  });
};

exports.createOrder = async ({ amount, currency, receipt, notes, config }) => {
  const razorpay = exports.createRazorpayClient(config);

  return razorpay.orders.create({
    amount: Math.round(amount * 100), // ✅ single conversion
    currency,
    receipt,
    notes,
  });
};

exports.capturePayment = async ({ orderId, paymentId, config }) => {
  const razorpay = exports.createRazorpayClient(config);

  return razorpay.payments.capture(paymentId, orderId);
};
