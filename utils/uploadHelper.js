const { bucket } = require("./gcs"); // Import bucket from gcs.js (CommonJS)
const { makePublicUrl } = require("./pathbuilderandpublicurl"); // Import helper functions

// Upload Image Function
const uploadImage = async ({
  folderPath,
  file,
  modelKey,
  userId,
  recordId,
}) => {
  try {
    const fileName = `${folderPath}${file.originalname}`;
    const gcsFile = bucket.file(fileName);

    await gcsFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
      resumable: false,
    });

    if (String(process.env.GCS_PUBLIC).toLowerCase() === "true") {
      await gcsFile.makePublic(); // Publicly accessible (if allowed)
    }

    return makePublicUrl({
      bucketName: process.env.GCS_BUCKET,
      objectName: fileName,
    });
  } catch (err) {
    console.error("[uploadImage] Error uploading image:", err);
    throw new Error("Image upload failed");
  }
};

// To delete an image from GCS
const deleteImageFromGCS = async (imageUrl) => {
  try {
    const path = imageUrl.replace(
      `https://storage.googleapis.com/${process.env.GCS_BUCKET}/`,
      ""
    );
    const file = bucket.file(path);
    await file.delete();
    // console.log(`[deleteImageFromGCS] Deleted ${imageUrl}`);
  } catch (err) {
    console.error("[deleteImageFromGCS] Error deleting image:", err);
    throw new Error("Image deletion failed");
  }
};

// Export functions using CommonJS
module.exports = { uploadImage, deleteImageFromGCS };
