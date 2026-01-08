// utils/notifyUser.js
const { sendMail } = require('./mailer');
const EmailMessage = require('../models/EmailMessage');

const SmtpConfig = require('../models/SmtpSetting'); // assuming you have a model

/**
 * Send notification email to the user
 * @param {Object} options - Notification options
 * @param {string} options.type - Type of notification ('content' | 'roleChange')
 * @param {Object} options.content - Content object (required if type='content')
 * @param {string} options.content.title - Title of the content
 * @param {string} options.content.status - Status ('published' | 'rejected')
 * @param {string} options.content.rejectionReason - Reason for rejection (optional)
 * @param {string} options.content.ownerEmail - Email of the content owner
 * @param {Object} options.user - User object (required if type='roleChange')
 * @param {string} options.user.name - Name of the user
 * @param {string} options.user.email - Email of the user
 * @param {string} options.user.roleStatus - 'approved' | 'rejected'
 * @param {string} options.user.rejectionReason - Reason if role change rejected (optional)
 */

// Default fallback messages (if not found in DB)
const DEFAULT_NOTIFY_MESSAGES = {

  contentRejected: {
    subject: 'Your content {{title}} has been rejected',
    body: `
      <p>Hi {{name}},</p>
      <p>Unfortunately, your content titled "<strong>{{title}}</strong>" was rejected.</p>
      <p><strong>Reason:</strong> {{reason}}</p>
      <p>Please review the feedback and resubmit after updates.</p>
      <p>- Galaxy Travellers Team</p>
    `,
  },
  roleApproved: {
    subject: 'Your Creator role has been approved!',
    body: `
      <p>Hi {{name}},</p>
      <p>Congratulations! Your account has been upgraded to <strong>Creator</strong>.</p>
      <p>You can now create and manage blogs, tours, and experiences.</p>
      <p>- Galaxy Travellers Team</p>
    `,
  },
  roleRejected: {
    subject: 'Your Creator role request was rejected',
    body: `
      <p>Hi {{name}},</p>
      <p>Unfortunately, your request to become a Creator has been rejected.</p>
      <p><strong>Reason:</strong> {{reason}}</p>
      <p>Please contact support for clarification or try again later.</p>
      <p>- Galaxy Travellers Team</p>
    `,
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
};

/**
 * Helper to get a message template from DB or defaults.
 */
async function getTemplate(key) {
  const record = await EmailMessage.findOne().lean();
  return (record && record[key]) || DEFAULT_NOTIFY_MESSAGES[key];
}

/**
 * Send notification email to the user.
 * @param {Object} options
 * @param {"content"|"roleChange"} options.type
 * @param {Object} options.content
 * @param {Object} options.user
 */
async function notifyUser(options) {
  try {
    const { type } = options;

    if (type === 'content') {
      const { title, status, rejectionReason, ownerEmail, name } =
        options.content;
      const { url } = options;

      if (!ownerEmail) {
        console.warn('[notifyUser] No ownerEmail provided.');
        return;
      }

      const data = { title, url };

      if (status === 'published') {
        await sendMail(ownerEmail, name || 'Creator', 'status', null, data);
      } else if (status === 'rejected') {
        await sendMail(ownerEmail, name || 'Creator', 'status', null, {
          ...data,
          reason: rejectionReason || 'Not specified',
        });
      }
    } else if (type === 'roleChange') {
      const { user } = options;
      if (!user?.email) {
        console.warn('[notifyUser] No user email provided.');
        return;
      }

      const data = {
        reason: user.rejectionReason || '',
        roleStatus: user.roleStatus,
      };

      await sendMail(user.email, user.name, 'status', null, data);
    }
  } catch (error) {
    console.error('❌ Error sending notification email:', error);
  }
}

module.exports = { notifyUser };
