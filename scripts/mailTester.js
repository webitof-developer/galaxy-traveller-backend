const nodemailer = require('nodemailer');

async function testGmail() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true if using port 465
    auth: {
      user: 'youremail.com',
      pass: 'qxdk faua quln umjm', // your app password
    },
  });

  const info = await transporter.sendMail({
    from: '"Galaxy Travellers" <youremail.com>',
    to: 'friendemail.com',
    subject: 'Test Gmail SMTP',
    text: 'Hello from Gmail SMTP via NodeMailer!',
  });

  console.log('Message sent:', info.messageId);
}

testGmail().catch(console.error);
