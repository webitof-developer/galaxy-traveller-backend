const mongoose = require("mongoose");

const FieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // stable client id (uuid)
    type: {
      type: String,
      enum: ["input", "textarea", "relation"],
      required: true,
    },
    name: { type: String, required: true }, // form key
    label: { type: String, required: true },
    placeholder: { type: String, default: "" },
    size: { type: String, enum: ["50", "100"], default: "50" },
    relationType: { type: String }, // only for relation
    locked: { type: Boolean, default: false },
  },
  { _id: false }
);

const LayoutSchema = new mongoose.Schema(
  {
    resource: { type: String, index: true, required: true }, // e.g. "tour"
    fields: { type: [FieldSchema], default: [] },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
  },
  { timestamps: true }
);

// One layout per user+resource
LayoutSchema.index({ userId: 1, resource: 1 }, { unique: true });

module.exports = mongoose.model("Layout", LayoutSchema);
