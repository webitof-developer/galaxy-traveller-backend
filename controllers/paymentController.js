const mongoose = require('mongoose');
const crypto = require('crypto');

const Booking = require('../models/Booking');
const PaymentTransaction = require('../models/PaymentTransaction');

const { createPayment } = require('../utils/paymentFactory');
const { sendMail } = require('../utils/mailer');
const { generateInvoicePdf } = require('../utils/invoicePdf');

const generateInvoiceId = () =>
  `INV_${(
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  ).toUpperCase()}`;

/* ======================================================
   CREATE PAYMENT INTENT (ORDER)
   ⚠️ Bind order to booking on backend
====================================================== */
exports.createPaymentIntent = async (req, res) => {
  const { gateway, bookingId, paymentMode: requestedMode } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  const {
    paymentMode,
    paymentStatus,
    totalAmount,
    partialAmount,
    amountPaid = 0,
  } = booking.payment;
  const remaining = Math.max(totalAmount - amountPaid, 0);

  // Decide mode for this payment attempt
  let effectiveMode = paymentMode;
  if (requestedMode === 'full') {
    effectiveMode = 'full';
  } else if (requestedMode === 'partial' && amountPaid === 0) {
    effectiveMode = 'partial';
  }
  if (paymentStatus === 'partial' && amountPaid > 0) {
    effectiveMode = 'full';
  }
  console.log(
    'Booking payment before verification:',
    booking,
    effectiveMode,
    totalAmount,
    partialAmount,
  );
  let payableAmount;

  if (effectiveMode === 'partial' && amountPaid === 0) {
    if (!partialAmount || partialAmount <= 0) {
      return res.status(400).json({ message: 'Partial amount not configured' });
    }
    payableAmount = partialAmount;
  } else {
    payableAmount = remaining;
  }

  if (payableAmount <= 0) {
    return res.status(400).json({ message: 'Nothing to pay' });
  }

  const order = await createPayment({
    gatewayKey: gateway,
    payload: {
      amount: payableAmount, // ✅ RUPEES
      currency: 'INR',
      receipt: `bk_${bookingId.slice(-6)}`,
      notes: { bookingId, paymentMode: effectiveMode },
    },
  });

  res.json({ data: order });
};

/* ======================================================
   VERIFY RAZORPAY PAYMENT
====================================================== */
exports.verifyRazorpay = async (req, res) => {
  try {
    const { orderId, paymentId, signature, bookingId, paymentMode: requestedMode } = req.body;

    if (!orderId || !paymentId || !signature || !bookingId) {
      throw new Error('Missing payment verification fields');
    }

    // 🔒 Idempotency
    const alreadyProcessed = await PaymentTransaction.findOne({ paymentId });
    if (alreadyProcessed) {
      return res.json({ success: true, message: 'Payment already processed' });
    }

    // 🔐 Signature verification
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      throw new Error('Invalid Razorpay signature');
    }

    const booking = await Booking.findById(bookingId).populate('user');
    if (!booking) throw new Error('Booking not found');
    if (!booking.invoiceId) {
      booking.invoiceId = generateInvoiceId();
    }
    const contactName = booking.contactInfo?.name || booking.user?.name;
    const contactEmail = booking.contactInfo?.email || booking.user?.email;

    const {
      paymentMode,
      paymentStatus,
      totalAmount,
      partialAmount,
      amountPaid: alreadyPaid = 0,
    } = booking.payment;

    let paidNow;

    // Compute payable based on current state and any client request
    if (paymentMode === 'partial' && alreadyPaid === 0) {
      if (requestedMode === 'full') {
        paidNow = totalAmount;
      } else {
        if (!partialAmount || partialAmount <= 0) {
          throw new Error('Partial amount not configured');
        }
        paidNow = partialAmount;
      }
    } else {
      paidNow = totalAmount - alreadyPaid;
    }

    if (paidNow <= 0) {
      throw new Error('Invalid payment state');
    }

    const newPaid = alreadyPaid + paidNow;
    const remaining = Math.max(totalAmount - newPaid, 0);

    // 🔒 Save transaction (ledger)
    await PaymentTransaction.create({
      bookingId,
      gateway: 'razorpay',
      orderId,
      paymentId,
      signature,
      amount: paidNow,
      status: 'captured',
      raw: req.body,
    });

    console.log('Payment verified for booking:', bookingId, {
      paidNow,
      newPaid,
      remaining,
      bookingPayment: booking.payment,
    });

    // 🔒 Update booking
    booking.payment.amountPaid = newPaid;
    booking.payment.remainingAmount = remaining;
    booking.payment.paymentStatus = remaining === 0 ? 'paid' : 'partial';
    booking.payment.paymentMode = remaining === 0 ? 'full' : booking.payment.paymentMode;
    booking.payment.isVerified = true;
    booking.payment.razorpay.orderId = orderId;
    booking.payment.razorpay.paymentId = paymentId;
    booking.payment.razorpay.signature = signature;
    booking.status = booking.payment.paymentStatus === 'failed' ? 'pending' : 'confirmed';

    await booking.save();
    const invoicePath = await generateInvoicePdf(booking);
    // 📧 Email
    const mailTemplate =
      remaining === 0 ? 'BOOKING_CONFIRMED_FULL' : 'BOOKING_CONFIRMED_PARTIAL';

    // 📧 Send Email with Invoice
    await sendMail({
      to: contactEmail,
      name: contactName,
      template: mailTemplate,
      data: {
        tourName: booking.tourName,
        amountPaid: booking.payment.amountPaid,
        remainingAmount: booking.payment.remainingAmount,
      },
      attachmentPath: invoicePath, // ✅ PDF ATTACHED
    });
    return res.json({
      success: true,
      paymentStatus: booking.payment.paymentStatus,
      remainingAmount: remaining,
    });
  } catch (err) {
    console.error('verifyRazorpay error:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};
