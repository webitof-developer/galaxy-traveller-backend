const Setting = require("../models/Setting");
const cache = require("../lib/cache/cache");
const SETTINGS_TTL = 600; // globals/settings: 5–15 minutes

// GET settings by key
exports.get = async (req, res) => {
  try {
    const cacheKey = `settings:${req.params.key || "global"}`;
    const { key = "global" } = req.params;
    const setting = await cache.getOrSet(cacheKey, SETTINGS_TTL, async () =>
      Setting.findOne({ key })
    );

    cache.setCacheHeaders(res, SETTINGS_TTL);
    const payload = setting || { key, data: {} };
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// UPDATE/UPSERT settings by key
exports.update = async (req, res) => {
  try {
    const { key = "global" } = req.params;
    const { data } = req.body;

    // Convert nested object into dot notation keys
    // Example: { tracking: { gtmId: "123" } }
    // → { "data.tracking.gtmId": "123" }
    const updateFields = {};
    for (const section in data) {
      for (const field in data[section]) {
        updateFields[`data.${section}.${field}`] = data[section][field];
      }
    }

    const setting = await Setting.findOneAndUpdate(
      { key },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    cache.del(`settings:${key}`);

    res.json(setting);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
