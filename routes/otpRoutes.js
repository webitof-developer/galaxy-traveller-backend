// routes/month.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/otp.controller');

router.post('/send', ctrl.sendFormOtp);
router.post('/verify', ctrl.verifyFormOtp);

module.exports = router;
