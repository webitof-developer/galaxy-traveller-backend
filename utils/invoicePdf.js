const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const invoiceTemplate = require('../data/invoiceTemplate');

exports.generateInvoicePdf = async (booking) => {
  const invoiceDir = path.join(__dirname, '../tmp/invoices');
  if (!fs.existsSync(invoiceDir)) {
    fs.mkdirSync(invoiceDir, { recursive: true });
  }

  const filePath = path.join(
    invoiceDir,
    `invoice-${booking.invoiceId || booking._id}.pdf`,
  );

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  const contactName = booking.contactInfo?.name || booking.user?.name || '';
  const contactEmail =
    booking.contactInfo?.email || booking.user?.email || '';
  const contactPhone =
    booking.contactInfo?.phone || booking.user?.phone || '';
  const html = invoiceTemplate({
    invoiceNumber: booking.invoiceId || booking._id,
    invoiceDate: new Date().toLocaleDateString(),

    customerName: contactName,
    customerEmail: contactEmail,
    customerPhone: contactPhone,
    transactionId:
      booking.payment?.razorpay?.paymentId ||
      booking.payment?.razorpay?.orderId,
    paymentMode: booking.payment?.paymentMode,

    tourName: booking.tourName,
    startDate: booking.startDate.toDateString(),
    endDate: booking.endDate.toDateString(),
    totalPersons: booking.totalPersons,

    totalAmount: booking.payment.totalAmount,
    amountPaid: booking.payment.amountPaid,
    remainingAmount: booking.payment.remainingAmount,

    status: booking.status,
    paymentStatus: booking.payment.paymentStatus,
  });

  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: filePath, format: 'A4', printBackground: true });

  await browser.close();

  return filePath;
};
