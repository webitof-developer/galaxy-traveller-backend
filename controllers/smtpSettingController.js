const SmtpSetting = require('../models/SmtpSetting');
const nodemailer = require('nodemailer');

// GET SMTP (admins only)
exports.get = async (req, res) => {
  try {
    const smtp = await SmtpSetting.findOne();
    res.json(smtp || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// UPDATE/UPSERT SMTP
exports.update = async (req, res) => {
  try {
    const smtp = await SmtpSetting.findOneAndUpdate({}, req.body, {
      new: true,
      upsert: true,
    });
    res.json(smtp);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.sendTestEmail = async (req, res) => {
  const { email, smtpSettings } = req.body;

  const transporter = nodemailer.createTransport({
    host: smtpSettings.host,
    port: smtpSettings.port,
    secure: smtpSettings.encryption === 'ssl', // true for 465, false for 587
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
  });

  const mailOptions = {
    from: `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>`,
    to: email,
    subject: 'Test Email',
    text: 'This is a test email sent from your SMTP configuration.',
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to send test email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
