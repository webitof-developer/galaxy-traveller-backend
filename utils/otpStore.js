// utils/otpStore.js
const otpStore = new Map(); // key: email, value: { otp, expires }

function setOtp(email, otp) {
  otpStore.set(email, {
    otp,
    expires: Date.now() + 5 * 60 * 1000, // 5 min expiry
  });
}

function verifyOtp(email, otp) {
  const record = otpStore.get(email);
  if (!record) return false;

  if (Date.now() > record.expires) {
    otpStore.delete(email);
    return false;
  }

  if (record.otp !== otp) return false;

  otpStore.delete(email); // OTP one-time use
  return true;
}

module.exports = { setOtp, verifyOtp };
