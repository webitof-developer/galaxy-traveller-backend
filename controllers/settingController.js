const Setting = require("../models/Setting");

// GET settings by key
exports.get = async (req, res) => {
  try {
    const { key = "global" } = req.params;
    const setting = await Setting.findOne({ key });

    res.json(setting || { key, data: {} });
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

    res.json(setting);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
