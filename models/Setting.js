const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "global"
    data: { type: Object, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", SettingSchema);
