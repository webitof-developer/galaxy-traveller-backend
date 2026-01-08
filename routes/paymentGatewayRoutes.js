// routes/paymentGateway.routes.js
const express = require('express');
const router = express.Router();

const {
  upsertGateway,
  getActiveGateways,
} = require('../controllers/paymentGatewayController');

// 🔒 Admin middleware lagana (mandatory in real app)
router.post('/', upsertGateway); // create / update
router.get('/', getActiveGateways); // frontend fetch

module.exports = router;
