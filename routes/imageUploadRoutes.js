const express = require("express");
const router = express.Router();
const imageController = require("../controllers/imageController");
const auth = require("../middleware/auth");

// Listing (folders + images only) with pagination/search
router.get("/", auth, imageController.listFiles); // querystring
router.post("/", auth, imageController.listFiles); // POST body { path|prefix, q, ... }

// Folder ops
router.post("/create-folder", auth, imageController.createFolder);

// Signers
router.get("/sign-read", auth, imageController.signRead);
router.post("/sign-upload", auth, imageController.signUploadForPath);
router.get("/sign-download", auth, imageController.signDownload);

// Delete object
router.delete("/", auth, imageController.deleteImage);

// Legacy helper
router.post("/get-signed-url", auth, imageController.getSignedUrl);

module.exports = router;
