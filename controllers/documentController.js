// controllers/documentController.js
// Google Cloud Storage: documents (pdf/doc/xls/ppt/images etc.)
// - Prefer signed URL uploads from the browser
// - Also supports server-side multipart upload
// - Always return { path } for DB, plus preview/download URLs for the dashboard

const { bucket } = require("../utils/gcs"); // your initialized @google-cloud/storage bucket
const multer = require("multer");

// -------- helpers --------
function normalizeObjectPath(input = "") {
  const p = String(input).replace(/^\/+/, "");
  if (!p || p.includes("..")) throw new Error("Invalid path");
  return p;
}
function safeFilename(name = "file") {
  return (
    String(name)
      .trim()
      .replace(/[^\w.\-()+@ ]/g, "_") || "file"
  );
}
function safeFolder(folder = "") {
  const f = String(folder)
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!f) return "";
  if (f.includes("..") || f.includes("//")) throw new Error("Invalid folder");
  return f;
}
const SIGN_WINDOW_MS = 15 * 60 * 1000;

function kycPrefix(userId) {
  if (!userId) throw new Error("Missing userId");
  return `kyc/${String(userId)}`;
}
async function ensureFolderSentinel(prefix) {
  const sentinel = `${prefix}/.keep`;
  try {
    await bucket.file(sentinel).save("", {
      resumable: false,
      contentType: "application/x-empty",
      metadata: { cacheControl: "no-store" },
    });
  } catch (_) {
    // ignore (overwrite-safe)
  }
}
function uniqueName(original) {
  const base = safeFilename(original || "document");
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}-${base}`;
}

// POST /api/docs/sign-upload { filename, contentType? }
exports.signUpload = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { filename, contentType } = req.body || {};
    // console.log("[docs.signUpload] filename:", filename);
    if (!filename)
      return res.status(400).json({ error: "filename is required" });

    const prefix = kycPrefix(userId);
    await ensureFolderSentinel(prefix); // create sentinel if not present

    const objectPath = `${prefix}/${uniqueName(filename)}`;

    const [uploadUrl] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + SIGN_WINDOW_MS,
      contentType: (contentType || "application/octet-stream").toLowerCase(),
    });
    res.json({
      path: objectPath, // store this in DB (documentPath)
      uploadUrl,
      publicUrl: `https://storage.googleapis.com/${bucket.name}/${objectPath}`, // UI-only if bucket public
      expiresAt: new Date(Date.now() + SIGN_WINDOW_MS).toISOString(),
    });
  } catch (err) {
    console.error("[docs.signUpload] error:", err);
    res
      .status(500)
      .json({ error: "Failed to sign upload", details: err.message });
  }
};

// GET /api/docs/sign-read?path=
exports.signRead = async (req, res) => {
  try {
    const raw = req.query.path;
    if (!raw) return res.status(400).json({ error: "Missing ?path=" });
    const objectPath = normalizeObjectPath(raw);

    const [url] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + SIGN_WINDOW_MS,
    });

    res.json({
      url, // preview in dashboard (don’t store in DB)
      expiresAt: new Date(Date.now() + SIGN_WINDOW_MS).toISOString(),
    });
  } catch (err) {
    console.error("[docs.signRead] error:", err);
    res
      .status(500)
      .json({ error: "Failed to sign read", details: err.message });
  }
};

exports.signDownload = async (req, res) => {
  try {
    const raw = req.query.path;
    if (!raw) return res.status(400).json({ error: "Missing ?path=" });

    const objectPath = normalizeObjectPath(raw);

    // Extract file name with extension
    let filename = req.query.filename || objectPath.split("/").pop();

    // Ensure filename includes extension, otherwise use the correct extension from the path
    if (!filename.includes(".")) {
      const fileExtension = objectPath.split(".").pop();
      filename = `${filename}.${fileExtension}`;
    }

    const [url] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + SIGN_WINDOW_MS,
      responseDisposition: `attachment; filename="${filename}"`, // Ensure the correct file extension
    });

    res.json({ url, filename });
  } catch (err) {
    console.error("[docs.signDownload] error:", err);
    res
      .status(500)
      .json({ error: "Failed to sign download", details: err.message });
  }
};

// -------- Server-side multipart upload (fallback) --------

// memory storage; rely on signed URL for big files
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/docs/upload (multipart/form-data)
// fields: file, folder? (default 'documents'), filename? (defaults to originalname)
exports.uploadMultipart = [
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });

      const folder = safeFolder(req.body.folder || "documents");
      const nameFromBody = req.body.filename && safeFilename(req.body.filename);
      const baseName =
        nameFromBody || safeFilename(req.file.originalname || "document");

      // optional per-user foldering
      const userId = req.user?._id || req.body.userId; // if you pass userId
      const prefix = userId ? `${folder}/${userId}` : folder;

      const objectPath = prefix ? `${prefix}/${baseName}` : baseName;

      await bucket.file(objectPath).save(req.file.buffer, {
        resumable: false,
        contentType: req.file.mimetype || "application/octet-stream",
        metadata: {
          cacheControl: "private, no-store", // Ensure file is not public
        },
      });

      // Signed read for immediate preview
      const [previewUrl] = await bucket.file(objectPath).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + SIGN_WINDOW_MS,
      });

      res.status(201).json({
        path: objectPath, // <-- store this in DB
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${objectPath}`, // UI only
        previewUrl, // UI only (temporary)
      });
    } catch (err) {
      console.error("[docs.uploadMultipart] error:", err);
      res.status(500).json({ error: "Upload failed", details: err.message });
    }
  },
];

// DELETE /api/docs  { path }
exports.deleteByPath = async (req, res) => {
  try {
    const { path } = req.body || {};
    if (!path) return res.status(400).json({ error: "path is required" });
    const clean = normalizeObjectPath(path);

    await bucket.file(clean).delete();
    res.json({ ok: true, deleted: clean });
  } catch (err) {
    const code = err?.code || 500;
    console.error("[docs.deleteByPath] error:", err);
    res.status(code === 404 ? 404 : 500).json({
      error: code === 404 ? "File not found" : "Failed to delete file",
      details: err.message,
    });
  }
};
