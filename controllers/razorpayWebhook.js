// controllers/razorpayWebhook.js
exports.razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== req.headers['x-razorpay-signature']) {
    return res.status(400).send('Invalid webhook');
  }

  const event = req.body.event;

  if (event === 'payment.captured') {
    const payment = req.body.payload.payment.entity;

    // 🔒 Idempotent: reuse PaymentTransaction logic
    await processPaymentFromWebhook(payment);
  }

  res.json({ received: true });
};
