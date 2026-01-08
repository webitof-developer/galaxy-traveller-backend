const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role'); // assuming this sends emails via SMTP
const auth = require('../middleware/auth');

const { OAuth2Client } = require('google-auth-library');
const { sendMail } = require('../utils/mailer');
const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
const OTP_EXPIRATION_TIME = 10 * 60 * 1000; // OTP valid for 10 minutes
const otpStore = {};

// ---------- utils ----------
function normalizeEmail(email) {
  return String(email || '')
    .toLowerCase()
    .trim();
}

function signToken(user, expiresIn = '7d') {
  return jwt.sign(
    {
      id: user._id,
      role: user.roleName,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn },
  );
}

/** Find the "client" role; supports name/key/slug */
async function ensureClientRole() {
  const role =
    (await Role.findOne({
      $or: [{ name: /^client$/i }, { key: /^client$/i }, { slug: /^client$/i }],
    })) || null;

  if (!role) {
    throw new Error(
      'Client role not configured. Please create a role with name/key/slug "client".',
    );
  }
  return role;
}

/** TODO: plug your actual OTP validation here */
async function isValidOtp(email, otp) {
  const storedOtp = otpStore[email];

  if (!storedOtp) {
    return false; // OTP doesn't exist for this email
  }

  if (Date.now() > storedOtp.expiresAt) {
    delete otpStore[email]; // Expired OTP, remove from store
    return false; // OTP has expired
  }

  return storedOtp.otp === otp; // Validate OTP
}

/** TODO: plug your actual Google token verifier (google-auth-library) */
// ---------- NEW: email check ----------
router.post('/check-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const exists = !!(await User.exists({ email }));
    return res.json({ exists });
  } catch (err) {
    console.error('check-email error:', err);
    return res.status(500).json({ message: 'Email check failed' });
  }
});

// ---------- OTP request ----------
router.post('/request-otp', async (req, res) => {
  try {
    const { email: rawEmail, type } = req.body;
    const email = normalizeEmail(rawEmail);
    console.log('request-otp body:', email);

    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (!type || !['login', 'signup'].includes(type)) {
      return res
        .status(400)
        .json({ message: 'type must be "login" or "signup"' });
    }

    const user = await User.findOne({ email });
    const userExists = !!user;

    if (type === 'login' && !userExists) {
      return res.status(404).json({
        status: 404,
        message: 'No account found for this email. Please sign up.',
      });
    }
    if (type === 'signup' && userExists) {
      return res
        .status(409)
        .json({ message: 'Account already exists. Please log in.' });
    }

    // ✅ Prevent sending OTP for Google-only users
    if (user && user.authProvider === 'google') {
      return res.status(403).json({
        message:
          'This account was created using Google Sign-In. Please login with Google.',
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with expiration time
    otpStore[email] = {
      otp,
      expiresAt: Date.now() + OTP_EXPIRATION_TIME,
    };

    // Send OTP via email (using your SMTP settings)
    const subject = 'Your OTP Code';
    const text = `Your OTP is: ${otp}`;

    console.log(`Sending OTP ${otp} to email ${email}`); // For debugging

    await sendMail({
      to: email,
      name: email.split('@')[0],
      template: 'OTP', // You can create a template for OTP emails
      data: { otp },
    });

    return res.json({ status: 200, message: 'OTP sent to email' });
  } catch (error) {
    console.error('request-otp error:', error);
    return res.status(500).json({ message: 'Failed to send OTP' });
  }
});

// ---------- OTP verify (login/signup) ----------
router.post('/verify-otp', async (req, res) => {
  try {
    const { email: rawEmail, otp: rawOtp, name: rawName, type } = req.body;
    const email = normalizeEmail(rawEmail);
    const otp = rawOtp ? String(rawOtp).trim() : null;
    const name = rawName ? String(rawName).trim() : null;

    if (!email || !otp || !type) {
      return res
        .status(400)
        .json({ message: 'email, otp, and type are required' });
    }
    if (!['login', 'signup'].includes(type)) {
      return res
        .status(400)
        .json({ message: 'type must be "login" or "signup"' });
    }

    const valid = await isValidOtp(email, otp); // Use the updated validation
    if (!valid) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (type === 'login') {
      let user = await User.findOne({ email }).populate('roleId', 'name');
      if (!user) {
        return res.status(404).json({
          message: 'No account found for this email. Please sign up.',
        });
      }
      if (user.status === 'inactive') {
        return res
          .status(403)
          .json({ message: 'Account is inactive. Contact support.' });
      }

      // ✅ Prevent OTP login for Google users
      if (user.authProvider === 'google') {
        return res.status(403).json({
          message:
            'This account was created using Google Sign-In. Please login with Google.',
        });
      }

      if (!user.roleName && user.roleId?.name) {
        user.roleName = user.roleId.name;
        await user.save();
      }

      const token = signToken(user);
      return res.json({ token, user, message: 'Logged in' });
    }

    // type === 'signup'
    const existing = await User.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ message: 'Account already exists. Please log in.' });
    }

    const clientRole = await ensureClientRole();

    const user = new User({
      email,
      name: name || email.split('@')[0],
      roleId: clientRole._id,
      roleName: clientRole.name,
      status: 'active',
      authProvider: 'email', // ✅ mark as email user
    });

    await user.save();

    const token = signToken(user);
    return res
      .status(201)
      .json({ token, user, message: 'Registered & Logged in' });
  } catch (error) {
    console.error('verify-otp error:', error);
    return res.status(500).json({ message: 'OTP verification failed' });
  }
});

// ---------- Google Sign-In ----------
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Missing token' });

    let payload = null;

    if (token.split('.').length === 3) {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error('Failed to fetch Google profile');
      payload = await response.json();
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!email)
      return res
        .status(400)
        .json({ message: 'Email not found in Google profile' });

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;

    if (!user) {
      const clientRole = await ensureClientRole();
      user = new User({
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        googleId,
        profileImg: picture,
        roleId: clientRole._id,
        roleName: clientRole.name,
        status: 'active',
        authProvider: 'google', // ✅ mark as google user
      });
      await user.save();
      isNewUser = true;
    } else {
      // ✅ Prevent Google login for email-only accounts
      if (user.authProvider === 'email') {
        return res.status(403).json({
          message:
            'This account was created using Email/OTP. Please login with OTP.',
        });
      }

      let updated = false;
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      if (picture && !user.profileImg) {
        user.profileImg = picture;
        updated = true;
      }
      if (!user.roleName && user.roleId) {
        const roleDoc = await Role.findById(user.roleId);
        if (roleDoc) {
          user.roleName = roleDoc.name;
          updated = true;
        }
      }
      if (updated) await user.save();
    }

    const appToken = signToken(user);

    return res.json({
      token: appToken,
      user,
      message: isNewUser
        ? 'Registered & Logged in with Google'
        : 'Logged in with Google',
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

module.exports = router;
