const mongoose = require("mongoose");

const RoleSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true }, // admin | creator | client | ...
    // Example:
    // permissions: {
    //   "*": { create: true, read: true, update: true, delete: true },  // wildcard defaults
    //   blog: { create: true, read: true, update: true, delete: false },
    // }
    description: { type: String },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Role", RoleSchema);
