const express = require('express');
require('dotenv').config();
const port = process.env.PORT || 5000;
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const sanitizeRequest = require('./middleware/sanitize');
const rateLimitPublic = require('./middleware/rateLimitPublic');
const rateLimitAuth = require('./middleware/rateLimitAuth');

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
  'https://galaxy-traveller-frontend.vercel.app',
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

/*
Cached endpoints (public read-heavy):
- GET /api/blog, /api/categories, /api/destinations, /api/months, /api/tour (list/detail/search) to shield Mongo on catalog reads.
- GET /api/home and site chrome: /api/site_global, /api/site_features, /api/site_destinationsList, /api/site_heroslides, /api/review.
- GET /api/policy, /api/settings, /api/payment-gateways as global settings/policy documents.
- GET /api/flyers for marketing assets.
*/
// Content Management
app.use('/api/blog', rateLimitPublic, require('./routes/blogRoutes'));
app.use('/api/categories', rateLimitPublic, require('./routes/categoryRoutes'));
app.use(
  '/api/destinations',
  rateLimitPublic,
  require('./routes/destinationRoutes'),
);
app.use('/api/enquiries', require('./routes/enquiryRoutes'));
app.use('/api/lead', require('./routes/leadRoutes'));
app.use('/api/months', rateLimitPublic, require('./routes/monthRoutes'));
app.use('/api/testimonial', require('./routes/testimonialRoutes'));
app.use('/api/tour', rateLimitPublic, require('./routes/tourRoutes')); // fixed typo here
app.use('/api/relations', rateLimitPublic, require('./routes/relationRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));

// Site Management (Admin only — dashboard)
app.use(
  '/api/site_destinationsList',
  rateLimitPublic,
  require('./routes/destinationListRoutes'),
);
app.use(
  '/api/site_features',
  rateLimitPublic,
  require('./routes/featuresRoutes'),
);
app.use('/api/site_global', rateLimitPublic, require('./routes/globalRoutes'));
app.use('/api/review', rateLimitPublic, require('./routes/reviewRoutes'));
app.use(
  '/api/site_heroslides',
  rateLimitPublic,
  require('./routes/heroSlideRoutes'),
);

// Main
app.use(['/api/home', '/api/search'], rateLimitPublic);
app.use('/api', require('./routes/homeRoutes')); // <- name matches the file exactly

app.use('/api/settings', rateLimitPublic, require('./routes/settings'));
app.use('/api/smtp-settings', require('./routes/smtpSettings'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// // ROUTES
app.use('/api/auth', rateLimitAuth, require('./routes/authRoute'));
app.use('/api/models', require('./routes/model'));
app.use('/api/schema', require('./routes/schema'));
// index.js
app.use('/api/export', require('./routes/exportRoutes'));
// Register the image routes
app.use('/api/images', require('./routes/imageUploadRoutes'));
app.use('/api/count', rateLimitPublic, require('./routes/count'));
app.use('/api/docs', require('./routes/documentRoutes'));

app.use('/apihome', require('./routes/slugsRoutes'));
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/emailMessages', require('./routes/emailMessageRoutes'));
app.use('/api/flyers', rateLimitPublic, require('./routes/flyerRoutes'));
app.use('/api/policy', rateLimitPublic, require('./routes/policyRoutes'));
app.use('/api/booking', require('./routes/bookingRoutes'));
// routes
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use(
  '/api/payment-gateways',
  rateLimitPublic,
  require('./routes/paymentGatewayRoutes'),
);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res
    .status(status)
    .json({ success: false, message: err.message || 'Server error' });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
  });
});

app.get('/health/ready', (req, res) => {
  const mongoState = mongoose.connection.readyState;

  const checks = {
    mongo: mongoState === 1 ? 'connected' : 'not_connected',
    env: {
      MONGO_URI: !!process.env.MONGO_URI,
      GCS_BUCKET: !!process.env.GCS_BUCKET,
    },
  };

  const isReady =
    mongoState === 1 && checks.env.MONGO_URI && checks.env.GCS_BUCKET;

  if (!isReady) {
    return res.status(503).json({
      status: 'not_ready',
      checks,
    });
  }

  res.status(200).json({
    status: 'ready',
    checks,
  });
});

app.get('/', (req, res) => {
  res.status(200).send('👋 Hello! GalaxyTravellers backend is live 🚀');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
