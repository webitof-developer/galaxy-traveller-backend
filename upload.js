// upload.js
const cloudinary = require("./utils/cloudinary");

// Upload from URL
async function uploadFromUrl(url, publicId) {
  try {
    const result = await cloudinary.uploader.upload(url, {
      public_id: publicId,
    });
    // console.log("Uploaded:", result.secure_url);
    return result;
  } catch (err) {
    console.error("Upload failed:", err);
  }
}

// Upload from local file
async function uploadFromLocal(filePath, publicId) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      public_id: publicId,
    });
    // console.log("Uploaded:", result.secure_url);
    return result;
  } catch (err) {
    console.error("Upload failed:", err);
  }
}

const optimizedUrl = cloudinary.url("shoes", {
  fetch_format: "auto",
  quality: "auto",
});

// console.log("Optimized URL:", optimizedUrl);

const croppedUrl = cloudinary.url("shoes", {
  width: 500,
  height: 500,
  crop: "auto",
  gravity: "auto",
});

// console.log("Cropped URL:", croppedUrl);

module.exports = { uploadFromUrl, uploadFromLocal };
