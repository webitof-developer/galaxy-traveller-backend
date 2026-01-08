const PhoneOtp = require('../models/PhoneOtp');
const { generateOtp, hashOtp, verifyOtp } = require('../utils/otp');
const { sendSms } = require('../utils/smsaleart');
const { ok, fail, asyncHandler } = require('../utils/respond');

exports.sendFormOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length < 10) {
    return fail(res, 'Valid phone number required', 400);
  }

  // Cooldown: prevent spam
  const recentOtp = await PhoneOtp.findOne({
    phone,
    verified: false,
    expiresAt: { $gt: new Date() },
  });

  // if (recentOtp) {
  //   return fail(res, 'OTP already sent. Please wait.', 429);
  // }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  await PhoneOtp.create({
    phone,
    otpHash,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
  });

  await sendSms(phone, 'OTP', [otp]);

  return ok(res, { message: 'OTP sent successfully' });
});

exports.verifyFormOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return fail(res, 'Phone and OTP required', 400);
  }

  const record = await PhoneOtp.findOne({
    phone,
    verified: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 }); // get the latest record

  console.log(record, otp);

  if (!record) {
    return fail(res, 'OTP expired or not found', 400);
  }

  if (record.attempts >= 3) {
    return fail(res, 'Too many incorrect attempts', 429);
  }

  const isValid = verifyOtp(otp, record.otpHash);

  if (!isValid) {
    record.attempts += 1;
    await record.save();
    return fail(res, 'Invalid OTP', 400);
  }

  record.verified = true;
  await record.save();

  return ok(res, { verified: true });
});
