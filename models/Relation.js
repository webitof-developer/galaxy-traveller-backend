const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Universal Relation Model
 *
 * Every relation is represented as ONE edge (document in this collection):
 * - from: { id, type }
 * - to:   { id, type }
 * - kind: stable string representing the relation pair
 *
 * No duplication. No reverse arrays. No stale relations.
 */

const RelationSchema = new Schema(
  {
    kind: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    from: {
      id: { type: Schema.Types.ObjectId, required: true, index: true },
      type: { type: String, required: true, index: true },
    },

    to: {
      id: { type: Schema.Types.ObjectId, required: true, index: true },
      type: { type: String, required: true, index: true },
    },
  },
  { timestamps: true }
);

// Prevent duplicate edges (one edge per pair)
RelationSchema.index({ kind: 1, "from.id": 1, "to.id": 1 }, { unique: true });

// For fast reverse lookups
RelationSchema.index({ kind: 1, "to.id": 1 });
RelationSchema.index({ kind: 1, "from.id": 1 });

module.exports = mongoose.model("Relation", RelationSchema);
