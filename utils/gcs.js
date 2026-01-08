const { Storage } = require("@google-cloud/storage");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const {
  GCS_BUCKET,
  GCS_AUTH_TYPE, // 'adc' | 'keyfile'
  GOOGLE_APPLICATION_CREDENTIALS, // path to key json (if keyfile)
} = process.env;

// Ensure the GCS_BUCKET is defined
if (!GCS_BUCKET) {
  throw new Error("GCS_BUCKET is required in .env");
}

let storage;
if (GCS_AUTH_TYPE === "keyfile") {
  storage = new Storage({
    keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
  });
} else {
  storage = new Storage();
}

// Get the bucket object
const bucket = storage.bucket(GCS_BUCKET);

// Make a file public after upload
async function makeFilePublic(path) {
  await bucket.file(path).makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

// Export the bucket as CommonJS module
module.exports = { bucket, makeFilePublic };
