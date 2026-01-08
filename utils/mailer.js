const nodemailer = require('nodemailer');
const SmtpSetting = require('../models/SmtpSetting');
const EmailMessage = require('../models/EmailMessage');

/* ======================================================
   TEMPLATE REGISTRY (CODE FIRST)
====================================================== */

const TEMPLATE_REGISTRY = {
  OTP: {
    subject: 'Your OTP Code',
    body: 'Hi {{name}}, your OTP is {{otp}}. It will expire in 10 minutes.',
  },

  ATTACHMENT: {
    subject: 'Your Requested File',
    body: 'Hi {{name}}, please find your requested file attached.',
  },

  STATUS_UPDATE: {
    subject: 'Update on Your Request',
    body: "Hi {{name}}, your request '{{title}}' has been processed. {{url}}",
  },

  BOOKING_CONFIRMED_FULL: {
    subject: 'Booking Confirmed – {{tourName}}',
    body: `
      <p>Hi {{name}},</p>
      <p>Your booking for <strong>{{tourName}}</strong> is confirmed.</p>
      <p><strong>Amount Paid:</strong> ₹{{amountPaid}}</p>
      <p>We look forward to hosting you.</p>
    `,
  },

  BOOKING_CONFIRMED_PARTIAL: {
    subject: 'Booking Confirmed – Pending Payment',
    body: `
      <p>Hi {{name}},</p>
      <p>Your booking for <strong>{{tourName}}</strong> is confirmed.</p>
      <p><strong>Paid:</strong> ₹{{amountPaid}}</p>
      <p><strong>Remaining:</strong> ₹{{remainingAmount}}</p>
      <p>Please complete the remaining payment before your trip.</p>
    `,
  },
  BOOKING_CANCELLED: {
    subject: 'Booking Cancelled - {{tourName}}',
    body: `
      <p>Hi {{name}},</p>
      <p>Your booking for <strong>{{tourName}}</strong> has been cancelled.</p>
      <p><strong>Reason:</strong> {{cancellationReason}}</p>
      <p>If a refund is due, you will receive a separate confirmation once processed.</p>
    `,
  },

  PAYMENT_REFUND_COMPLETED: {
    subject: 'Refund Processed - {{tourName}}',
    body: `
      <p>Hi {{name}},</p>
      <p>Your refund for <strong>{{tourName}}</strong> has been processed.</p>
      <p><strong>Refund Amount:</strong> {{refundAmount}}</p>
      <p>Please allow a few business days for it to reflect in your account.</p>
    `,
  },
};

/* ======================================================
   SMTP
====================================================== */

async function getActiveSmtpConfig() {
  const smtp = await SmtpSetting.findOne().lean();
  if (!smtp) throw new Error('SMTP not configured');
  return smtp;
}

function createTransporter(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.encryption === 'ssl' ? 465 : 587,
    secure: smtp.encryption === 'ssl',
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
    tls: { rejectUnauthorized: false },
  });
}

/* ======================================================
   TEMPLATE RESOLUTION (DB → CODE FALLBACK)
====================================================== */

async function resolveTemplate(key) {
  // Try DB override
  const dbTemplates = await EmailMessage.findOne().lean();
  if (dbTemplates && dbTemplates[key]) return dbTemplates[key];

  // Fallback to code registry
  if (TEMPLATE_REGISTRY[key]) return TEMPLATE_REGISTRY[key];

  throw new Error(`Email template not found: ${key}`);
}

function compileTemplate(template, data) {
  let html = template.body;

  for (const match of html.match(/{{(.*?)}}/g) || []) {
    const k = match.replace(/[{}]/g, '');
    html = html.replace(new RegExp(match, 'g'), data[k] ?? '');
  }

  return {
    subject: template.subject.replace(/{{(.*?)}}/g, (_, k) => data[k] ?? ''),
    html,
    text: html.replace(/<[^>]*>?/gm, ''),
  };
}

/* ======================================================
   MAIN MAIL SENDER (SINGLE ENTRY POINT)
====================================================== */

async function sendMail({
  to,
  name,
  template,
  data = {},
  attachmentPath = null,
}) {
  console.log(`📧 Sending ${template} → ${to}`);
  if (!to || !to.includes('@')) {
    throw new Error(`Invalid email: ${to}`);
  }

  const smtp = await getActiveSmtpConfig();
  const transporter = createTransporter(smtp);

  const tpl = await resolveTemplate(template);
  const compiled = compileTemplate(tpl, { name, ...data });

  const mail = {
    from: `${smtp.fromName || 'Galaxy Travellers'} <${smtp.fromEmail}>`,
    to,
    subject: compiled.subject,
    text: compiled.text,
    html: compiled.html,
  };

  if (attachmentPath) {
    mail.attachments = [
      {
        filename: attachmentPath.split(/[\\/]/).pop(),
        path: attachmentPath,
      },
    ];
  }

  console.log(`📧 Sending ${template} → ${to}`);
  return transporter.sendMail(mail);
}

/* ======================================================
   EXPORT
====================================================== */

module.exports = {
  sendMail,
  TEMPLATE_REGISTRY,
};
