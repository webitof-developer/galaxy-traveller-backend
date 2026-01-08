// routes/payment.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/paymentController');

// user / customer route
router.post('/create', ctrl.createPaymentIntent);
router.post('/verify', ctrl.verifyRazorpay);

module.exports = router;
