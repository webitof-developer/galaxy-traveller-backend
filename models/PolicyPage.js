const mongoose = require("mongoose");

const policySchema = new mongoose.Schema(
  {
    policies: { type: String, default: "" }, // Markdown stored
    terms: { type: String, default: "" }, // Markdown stored
  },
  { timestamps: true }
);

module.exports = mongoose.model("Policy", policySchema);
