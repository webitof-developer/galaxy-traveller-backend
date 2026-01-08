require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.SMSALERT_API_KEY;
const SENDER = process.env.SMSALERT_SENDER;
const SMS_URL = 'https://www.smsalert.co.in/api/push.json';

/**
 * Central template registry (DLT approved texts ONLY)
 */
const TEMPLATES = {
  OTP: {
    text: 'Galaxy Travellers: Your OTP for contact verification is {#var#}. Do not share this OTP with anyone.',
    vars: 1,
  },

  BOOKING_CONFIRM: {
    text: 'Galaxy Travellers Your booking is confirmed. Booking ID {#var#}. Status: {#var#}. Thank you.',
    vars: 2,
  },

  INVOICE: {
    text: 'Galaxy Travellers: Invoice generated for Booking ID {#var#}. Invoice ID {#var#}.',
    vars: 2,
  },

  TOUR_CONFIRM: {
    text: 'Galaxy Travellers: Booking {#var#} is confirmed for {#var#}. Check details in your account.',
    vars: 2,
  },

  PAYMENT_UPDATE: {
    text: 'Galaxy Travellers: Payment update for Booking ID {#var#}. Status: {#var#}. Please retry if needed.',
    vars: 2,
  },
};

/**
 * OTP generator
 */
function generateOtp(length = 6) {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Replace {#var#} safely
 */
function buildMessage(templateKey, values = []) {
  const template = TEMPLATES[templateKey];
  if (!template) throw new Error('Invalid SMS template type');

  if (values.length !== template.vars) {
    throw new Error(
      `Template ${templateKey} expects ${template.vars} variables`,
    );
  }

  let message = template.text;
  values.forEach((val) => {
    message = message.replace('{#var#}', val);
  });

  return message;
}

/**
 * Send SMS
 */
async function sendSms(mobile, templateKey, values) {
  const text = buildMessage(templateKey, values);

  const params = new URLSearchParams({
    apikey: API_KEY,
    sender: SENDER,
    mobileno: mobile,
    text,
  });

  const resp = await axios.post(SMS_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  console.log('resp', params,resp);

  return resp.data;
}

module.exports = {
  generateOtp,
  sendSms,
};
