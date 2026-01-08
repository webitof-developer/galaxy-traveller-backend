// models/Destination.js (fixed)
const mongoose = require("mongoose");
const { HighlightSchema, SEOSchema } = require("./Shared");

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

const imgUrlRx = /^https?:\/\/.+\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i;

const DestinationSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9-]+$/,
        "Slug can only contain lowercase letters, numbers, and hyphens",
      ],
    },

    title: { type: String, required: true, minlength: 4, maxlength: 100 },
    description: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 100,
    },

    highlight: { type: HighlightSchema, required: true, default: {} },

    displayImg: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "draft",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    heroImg: {
      type: String,
      required: true,
    },

    seo: { type: SEOSchema, required: true, default: {} },

    startingPrice: { type: Number, required: true, min: 1, default: 10000 },

    blogs: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: undefined },
    ],
    tours: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tour", default: undefined },
    ],
    tagMonths: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Month",
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

DestinationSchema.pre("validate", function (next) {
  if (this.title && !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

// Indexes
DestinationSchema.index({ status: 1, createdAt: -1 });
DestinationSchema.index({ slug: 1 }, { unique: true });
DestinationSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Destination", DestinationSchema);
