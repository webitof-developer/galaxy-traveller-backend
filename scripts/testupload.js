const { Storage } = require('@google-cloud/storage');
const dotenv = require('dotenv');
const fs = require('fs'); // For reading the file
dotenv.config();

// Initialize Google Cloud Storage client
const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const bucketName = process.env.GCS_BUCKET; // Your bucket name
const bucket = storage.bucket(bucketName);

// Test Upload
async function testUpload() {
  try {
    const filePath =
      'E:/Github/Office/TravelTailor/backend/images/pngaaa.com-4792850.png';
    // Path to the file you want to upload
    const fileName = 'testfile.png'; // Name you want the file to have in GCS

    await bucket.upload(filePath, {
      destination: fileName, // Save file with this name in the bucket
      gzip: true, // Optionally, gzip the file
    });

    console.log(`File ${fileName} uploaded to ${bucketName}.`);
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

// Run the test
testUpload();
