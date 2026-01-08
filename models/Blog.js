const mongoose = require("mongoose");
const { SEOSchema } = require("./Shared");

// --- tiny, dependency-free slugify ---
function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// --- transform to add id / flatten extras ---
function transformOut(doc, ret) {
  // merge extras into top-level (without overwriting)
  if (ret.extras) {
    for (const [k, v] of Object.entries(ret.extras)) {
      if (ret[k] === undefined) ret[k] = v;
    }
    delete ret.extras;
  }
  // normalize id / remove internals
  ret.id = ret._id;
  delete ret._id;
  delete ret.__v;
  return ret;
}

const BlogSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,

      sparse: true, // allow multiple nulls
      index: true,
    },
    title: {
      type: String,
      required: true,
      minlength: 4,
      index: true,
    },
    description: {
      type: String,
      required: true,
      minlength: 10,
      index: true,
    },
    displayImg: {
      type: String,
      required: true,
    },
    readTime: { type: String },
    body: { type: String, required: true, minlength: 10, maxlength: 30000 },
    bodyAlt: { type: String, maxlength: 2000 },
    destinations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Destination",
        default: undefined,
      },
    ],
    readTime: { type: String, trim: true },

    tours: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tour", default: undefined },
    ],
    blogs: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: undefined },
    ],
    blog: { type: mongoose.Schema.Types.ObjectId, ref: "Blog" },

    seo: { type: SEOSchema, required: true, default: {} },

    // author is a plain display name string
    author: { type: String, trim: true, maxlength: 120 },

    // owner reference for permission checks
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "draft",
      index: true,
    },

    tagMonths: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Month",
        default: undefined,
      },
    ],
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        default: undefined,
      },
    ],

    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  }
);

// --- Indexes ---
BlogSchema.index({ status: 1, createdAt: -1 }); // latest published
BlogSchema.index({ slug: 1 }, { unique: true, sparse: true }); // explicit for clarity
BlogSchema.index({ title: "text", description: "text", author: "text" }); // search

// --- Auto-generate & normalize slug, ensure uniqueness ---
BlogSchema.pre("validate", async function () {
  // normalize existing slug or make from title
  if (this.slug) this.slug = slugify(this.slug);
  if (!this.slug && this.title) this.slug = slugify(this.title);

  // ensure uniqueness by suffixing -2, -3, ...
  if (this.slug) {
    const base = this.slug;
    let candidate = base;
    let i = 1;

    while (
      await this.constructor.exists({
        slug: candidate,
        _id: { $ne: this._id },
      })
    ) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    this.slug = candidate;
  }
});

module.exports = mongoose.model("Blog", BlogSchema);
