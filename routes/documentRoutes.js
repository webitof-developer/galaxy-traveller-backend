// routes/documents.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

const docs = require("../controllers/documentController");

// Signed URL flow (recommended for large files)
router.post("/sign-upload", auth, docs.signUpload);
router.get("/sign-read", auth, docs.signRead);
router.get(
  "/sign-download",
  auth,
  ensurePermission("read", "creatorRequest"),
  docs.signDownload
);

// Direct multipart upload (fallback/convenience)
router.post("/upload", auth, docs.uploadMultipart);

// Delete by path
router.delete(
  "/",
  auth,
  ensurePermission("delete", "creatorRequest"),
  docs.deleteByPath
);

module.exports = router;
