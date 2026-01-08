const express = require("express");
const router = express.Router();
const Layout = require("../models/Resource");
const auth = require("../middleware/auth");

// GET /api/layouts/:resource
router.get("/:resource", auth, async (req, res) => {
  try {
    const { resource } = req.params;

    // Create if missing, else return existing
    const doc = await Layout.findOneAndUpdate(
      { resource },
      { $setOnInsert: { resource, fields: [], userId: null } },
      { new: true, upsert: true } // return the doc; create if none
    );

    return res.json({
      fields: doc.fields || [],
      updatedAt: doc.updatedAt || null,
    });
  } catch (err) {
    console.error("GET /api/layouts error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/layouts/:resource
router.put("/:resource", auth, async (req, res) => {
  try {
    const { resource } = req.params;
    const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];

    // Validate payload shape
    const invalid = fields.find(
      (f) =>
        !f ||
        typeof f.id !== "string" ||
        !["input", "textarea", "relation"].includes(f.type) ||
        typeof f.name !== "string" ||
        typeof f.label !== "string"
    );
    if (invalid) {
      return res.status(400).json({ error: "Invalid fields payload", invalid });
    }

    // Build update; only set keys that exist in your schema
    const update = {
      $set: { fields },
      $setOnInsert: { resource }, // ensure resource is present on new doc
    };
    // Optional: track who updated (only if your schema has updatedBy)
    if (req.user?.email) update.$set.updatedBy = req.user.email;

    const doc = await Layout.findOneAndUpdate({ resource }, update, {
      new: true, // return updated doc
      upsert: true, // create if not found
      runValidators: true, // validate against schema
      setDefaultsOnInsert: true,
    });

    return res.json({
      ok: true,
      fields: doc.fields || [],
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error("PUT /layouts error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
