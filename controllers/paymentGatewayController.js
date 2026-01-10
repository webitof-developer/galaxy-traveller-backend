// controllers/paymentGateway.controller.js
const PaymentGateway = require('../models/PaymentGateway');
const cache = require('../lib/cache/cache');
const TTL_SECONDS = 600; // gateways config behaves like settings
const CACHE_KEY = 'payment:gateways:active';

exports.upsertGateway = async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ message: 'Gateway key required' });
  }

  const gateway = await PaymentGateway.findOneAndUpdate({ key }, req.body, {
    upsert: true,
    new: true,
  });

  cache.del(CACHE_KEY);
  res.json({ data: gateway });
};
exports.getActiveGateways = async (req, res) => {
  const gateways = await cache.getOrSet(CACHE_KEY, TTL_SECONDS, async () =>
    PaymentGateway.find({ isActive: true })
      .select('-credentials.keySecret -credentials.secretKey')
      .lean(),
  );

  cache.setCacheHeaders(res, TTL_SECONDS);
  res.json({ data: gateways });
};
