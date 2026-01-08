const mongoose = require("mongoose");
const { HeroSlideSchema } = require("./Shared");

const HeroSchema = new mongoose.Schema(
  {
    heroSlide: {
      type: [HeroSlideSchema],
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "draft",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: flattenExtras },
    toObject: { virtuals: true, transform: flattenExtras },
  }
);

// Flatten extras into top-level fields
function flattenExtras(doc, ret) {
  if (ret.extras) {
    for (const [key, value] of Object.entries(ret.extras)) {
      // Only overwrite if field doesn't exist at top level
      if (ret[key] === undefined) {
        ret[key] = value;
      }
    }
    delete ret.extras; // optional: remove extras wrapper
  }
  return ret;
}

HeroSchema.index({ status: 1 });
module.exports = mongoose.model("Hero", HeroSchema);
