const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cancellationTemplate = require('./cancellationTemplate');

exports.generateCancellationPdf = async (booking, refundInfo) => {
  const invoiceDir = path.join(__dirname, '../tmp/invoices');
  if (!fs.existsSync(invoiceDir)) {
    fs.mkdirSync(invoiceDir, { recursive: true });
  }

  const filePath = path.join(invoiceDir, `cancellation-${booking._id}.pdf`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  const html = cancellationTemplate({
    invoiceNumber: booking._id,
    invoiceDate: new Date().toLocaleDateString(),

    customerName: booking.user.name,
    customerEmail: booking.user.email,
    customerPhone: booking.contactInfo?.phone,

    tourName: booking.tourName,
    startDate: booking.startDate.toDateString(),
    endDate: booking.endDate.toDateString(),
    totalPersons: booking.totalPersons,

    totalAmount: booking.payment.totalAmount,
    amountPaid: booking.payment.amountPaid,
    refundAmount: refundInfo.amount,

    refundStatus: refundInfo.status,
    reason: refundInfo.reason,
  });

  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: filePath, format: 'A4', printBackground: true });

  await browser.close();

  return filePath;
};
