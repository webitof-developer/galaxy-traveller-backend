// src/controllers/slugController.js
const Blog = require("../models/Blog");
const Tour = require("../models/Tour");
const Destination = require("../models/Destination");
const cache = require("../utils/cache");

const MODEL_BY_TYPE = {
  blog: Blog,
  tour: Tour,
  destination: Destination,
};

/**
 * GET /apihome/slugs/:type
 * Query params:
 *   - since (ISO date string; returns docs updatedAt >= since)
 *   - status (default "published"; pass "" to disable)
 */
exports.getSlugs = async (req, res) => {
  try {
    const type = String(req.params.type || "").toLowerCase();
    const Model = MODEL_BY_TYPE[type];
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Expected one of: ${Object.keys(
          MODEL_BY_TYPE
        ).join(", ")}`,
      });
    }

    const status =
      req.query.status === "" ? null : req.query.status || "published";
    const since = req.query.since ? new Date(req.query.since) : null;

    if (since && isNaN(since.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid 'since' date" });
    }

    const query = {
      slug: { $exists: true, $ne: null, $ne: "" },
    };
    if (status) query.status = status;
    if (since) query.updatedAt = { $gte: since };

    // Projection is minimal for sitemap
    const projection = { slug: 1, updatedAt: 1, _id: 0 };

    const key = `slugs:${type}:${status || "all"}:${since ? since.toISOString() : "all"}`;

    const items = await cache.getOrSet(key, 600, async () =>
      Model.find(query, projection).sort({ updatedAt: -1 }).lean().exec()
    );

    // Cache headers (tune as you like)
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

    if (items.length) {
      const newest = items[0].updatedAt;
      if (newest) res.set("Last-Modified", new Date(newest).toUTCString());
    }

    return res.json({
      success: true,
      type,
      data: items, // [{ slug, updatedAt }]
    });
  } catch (err) {
    console.error("getSlugs error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
