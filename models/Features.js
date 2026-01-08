// models/Featured.js (tightened, no extra fields)
const mongoose = require("mongoose");

// normalize output (id + flatten extras)
function transformOut(doc, ret) {
  if (ret.extras) {
    for (const [k, v] of Object.entries(ret.extras)) {
      if (ret[k] === undefined) ret[k] = v;
    }
    delete ret.extras;
  }
  ret.id = ret._id;
  delete ret._id;
  delete ret.__v;
  return ret;
}

const FeaturedSchema = new mongoose.Schema(
  {
    blogs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Blog" }],
    destinations: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Destination" },
    ],
    tours: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tour" }],
    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "published",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  }
);

// helpful index for latest-first queries
FeaturedSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Featured", FeaturedSchema);
