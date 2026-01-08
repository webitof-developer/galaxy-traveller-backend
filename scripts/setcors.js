const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const bucketName = process.env.GCS_BUCKET;

async function setCORS() {
  const bucket = storage.bucket(bucketName);

  // Correct way → patch bucket metadata
  await bucket.setMetadata({
    cors: [
      {
        origin: ['http://localhost:5173', 'http://localhost:3000','https://admin.subhajitmondal.com','https://api.subhajitmondal.com','https://gt.subhajitmondal.com'], // add prod domain too
        method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        responseHeader: ['Content-Type', 'x-goog-acl'],
        maxAgeSeconds: 3600,
      },
    ],
  });

  console.log('CORS configuration applied successfully!');
}

setCORS().catch(console.error);
