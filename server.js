const express = require('express');
require('dotenv').config();
const port = process.env.PORT || 5000;
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const sanitizeRequest = require('./middleware/sanitize');

const EmailMessage = require('./models/EmailMessage');
const { DEFAULT_MESSAGES } = require('./utils/mailer');
const Booking = require('./models/Booking');

const path = require('path');
const { Storage } = require('@google-cloud/storage');

app.use(express.json());
app.use(sanitizeRequest);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5000',
  'https://admin.subhajitmondal.com',
  'https://gt.subhajitmondal.com',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error(`CORS policy: ${origin} not allowed`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Google Cloud Storage configuration
const gcs = new Storage({
  keyFilename: path.join(__dirname, 'path-to-your-service-account-file.json'),
});
const bucketName = process.env.GCS_BUCKET;
const bucket = gcs.bucket(bucketName);

// DB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('Mongo error:', err));
// 🧩 Once Mongo is ready, ensure default messages exist
mongoose.connection.once('open', async () => {
  try {
    const existing = await EmailMessage.findOne();
    if (!existing) {
      await EmailMessage.create(DEFAULT_MESSAGES);
      console.log('✅ Default EmailMessage created in DB');
    } else {
      console.log('ℹ️ EmailMessage already exists, skipping defaults');
    }
  } catch (err) {
    console.error('⚠️ Failed to create default email messages:', err.message);
  }

  // Cleanup job: delete pending bookings older than 1 day
  const cleanupPendingBookings = async () => {
    try {
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day
      const result = await Booking.deleteMany({
        status: 'pending',
        createdAt: { $lt: threshold },
      });
      if (result?.deletedCount) {
        console.log(
          `🧹 Deleted ${result.deletedCount} stale pending bookings older than 1 day`,
        );
      }
    } catch (err) {
      console.error('⚠️ Failed to clean stale bookings:', err.message);
    }
  };

  // run once on startup and then every 24 hours
  cleanupPendingBookings();
  setInterval(cleanupPendingBookings, 24 * 60 * 60 * 1000);
});

// Content Management
app.use('/api/blog', require('./routes/blogRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/destinations', require('./routes/destinationRoutes'));
app.use('/api/enquiries', require('./routes/enquiryRoutes'));
app.use('/api/lead', require('./routes/leadRoutes'));
app.use('/api/months', require('./routes/monthRoutes'));
app.use('/api/testimonial', require('./routes/testimonialRoutes'));
app.use('/api/tour', require('./routes/tourRoutes')); // fixed typo here
app.use('/api/relations', require('./routes/relationRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));

// Site Management (Admin only — dashboard)
app.use(
  '/api/site_destinationsList',
  require('./routes/destinationListRoutes'),
);
app.use('/api/site_features', require('./routes/featuresRoutes'));
app.use('/api/site_global', require('./routes/globalRoutes'));
app.use('/api/review', require('./routes/reviewRoutes'));
app.use('/api/site_heroslides', require('./routes/heroSlideRoutes'));

// Main
app.use('/api', require('./routes/homeRoutes')); // <- name matches the file exactly

app.use('/api/settings', require('./routes/settings'));
app.use('/api/smtp-settings', require('./routes/smtpSettings'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// // ROUTES
app.use('/api/auth', require('./routes/authRoute'));
app.use('/api/models', require('./routes/model'));
app.use('/api/schema', require('./routes/schema'));
// index.js
app.use('/api/export', require('./routes/exportRoutes'));
// Register the image routes
app.use('/api/images', require('./routes/imageUploadRoutes'));
app.use('/api/count', require('./routes/count'));
app.use('/api/docs', require('./routes/documentRoutes'));

app.use('/apihome', require('./routes/slugsRoutes'));
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/emailMessages', require('./routes/emailMessageRoutes'));
app.use('/api/flyers', require('./routes/flyerRoutes'));
app.use('/api/policy', require('./routes/policyRoutes'));
app.use('/api/booking', require('./routes/bookingRoutes'));
// routes
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/payment-gateways', require('./routes/paymentGatewayRoutes'));

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res
    .status(status)
    .json({ success: false, message: err.message || 'Server error' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});



app.get('/', (req, res) => {
  res.status(200).send('👋 Hello! GalaxyTravellers backend is live 🚀');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
