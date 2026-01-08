const mongoose = require("mongoose");

const SmtpSettingSchema = new mongoose.Schema(
  {
    host: String,
    port: Number,
    username: String,
    password: String,
    encryption: { type: String, enum: ["none", "ssl", "tls"], default: "tls" },
    fromName: String,
    fromEmail: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SmtpSetting", SmtpSettingSchema);
