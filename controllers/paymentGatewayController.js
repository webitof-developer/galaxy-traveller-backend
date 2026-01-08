// controllers/paymentGateway.controller.js
const PaymentGateway = require('../models/PaymentGateway');

exports.upsertGateway = async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ message: 'Gateway key required' });
  }

  const gateway = await PaymentGateway.findOneAndUpdate({ key }, req.body, {
    upsert: true,
    new: true,
  });

  res.json({ data: gateway });
};
exports.getActiveGateways = async (req, res) => {
  const gateways = await PaymentGateway.find({ isActive: true }).select(
    '-credentials.keySecret -credentials.secretKey',
  );

  res.json({ data: gateways });
};
