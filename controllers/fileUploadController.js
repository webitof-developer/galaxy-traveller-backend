const fs = require("fs");
const path = require("path");

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    console.log("Uploaded file:", req.file);

    const oldPath = path.resolve(req.file.path);
    const ext = path.extname(req.file.originalname);
    const newPath = path.join(uploadDir, `current${ext}`);

    // ✅ Remove old files EXCEPT the one we just uploaded
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
      const existingPath = path.join(uploadDir, file);
      if (existingPath !== oldPath) {
        fs.unlinkSync(existingPath);
      }
    }

    console.log("Renaming:", oldPath, "→", newPath);

    if (!fs.existsSync(oldPath)) {
      console.error("❌ Upload file missing:", oldPath);
      return res.status(500).json({ error: "Upload failed, file not found." });
    }

    fs.renameSync(oldPath, newPath);

    res.json({ success: true, filename: `current${ext}` });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getFile = (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    if (files.length === 0)
      return res.status(404).json({ error: "No file found" });

    const filePath = path.join(uploadDir, files[0]);
    res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Get file error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteFile = (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    if (files.length === 0)
      return res.status(404).json({ error: "No file to delete" });

    for (const file of files) fs.unlinkSync(path.join(uploadDir, file));
    res.json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("❌ Delete file error:", error);
    res.status(500).json({ error: error.message });
  }
};
