module.exports = function invoiceTemplate(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Invoice</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f6f6f6;
      padding: 20px;
    }
    .invoice {
      max-width: 800px;
      margin: auto;
      background: #fff;
      padding: 30px;
      border-radius: 8px;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .brand {
      font-size: 22px;
      font-weight: bold;
    }
    .small {
      font-size: 13px;
      color: #777;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
      font-size: 14px;
    }
    th {
      text-align: left;
      background: #f2f2f2;
    }
    td:last-child, th:last-child {
      text-align: right;
    }
    .total {
      font-weight: bold;
    }
    .status {
      margin-top: 20px;
      padding: 12px;
      background: #f0f8ff;
      border-radius: 6px;
      font-size: 14px;
    }
    .footer {
      margin-top: 30px;
      font-size: 12px;
      color: #777;
      text-align: center;
    }
  </style>
</head>

<body>
  <div class="invoice">
    <div class="header">
      <div>
        <div class="brand">Galaxy Traveller</div>
        <div class="small">Booking Invoice</div>
      </div>
      <div class="small">
        Invoice #: ${data.invoiceNumber}<br/>
        Date: ${data.invoiceDate}<br/>
        ${
          data.transactionId ? `Transaction ID: ${data.transactionId}<br/>` : ''
        }
        ${data.paymentMode ? `Payment Mode: ${data.paymentMode}` : ''}
      </div>
    </div>

    <div class="small">
      <strong>Billed To:</strong><br/>
      ${data.customerName}<br/>
      ${data.customerEmail}<br/>
      ${data.customerPhone || ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            ${data.tourName}<br/>
            <span class="small">
              Dates: ${data.startDate} – ${data.endDate}<br/>
              Guests: ${data.totalPersons}
            </span>
          </td>
          <td>${data.totalAmount}</td>
        </tr>
        <tr>
          <td>Amount Paid</td>
          <td>${data.amountPaid}</td>
        </tr>
        <tr class="total">
          <td>Remaining Amount</td>
          <td>${data.remainingAmount}</td>
        </tr>
      </tbody>
    </table>

    <div class="status">
      <strong>Booking Status:</strong> ${data.status}<br/>
      <strong>Payment Status:</strong> ${data.paymentStatus}
    </div>

    <div class="footer">
      This is a system generated invoice. No signature required.
    </div>
  </div>
</body>
</html>
`;
};
