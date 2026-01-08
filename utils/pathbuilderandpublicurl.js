// Builds GCS folder path: storage/{modelKey}/{userId}/{recordId}/
const buildFolderPath = ({ modelKey, userId, recordId }) => {
  if (!modelKey) {
    throw new Error('modelKey is required to build folder path');
  }

  const safe = (s) =>
    String(s)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');

  if (!userId) {
    // No userId, store directly under modelKey
    return `storage/${safe(modelKey)}/`;
  } else if (!recordId) {
    // userId present, but no recordId, store under modelKey/userId
    return `storage/${safe(modelKey)}/${safe(userId)}/`;
  } else {
    // userId and recordId both present, store under modelKey/userId/recordId
    return `storage/${safe(modelKey)}/${safe(userId)}/${safe(recordId)}/`;
  }
};

// Public URL for "uniform public access" buckets
const makePublicUrl = ({ bucketName, objectName }) => {
  return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(
    objectName,
  )}`;
};

// Export functions using CommonJS
module.exports = { buildFolderPath, makePublicUrl };
