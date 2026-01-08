// models/Month.js (fixed, no new fields added)
const mongoose = require("mongoose");
const { HighlightSchema } = require("./Shared");

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

const MonthSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      enum: [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ],
      required: true,
      lowercase: true,
      trim: true,
    },
    monthTag: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    displayImg: {
      type: String,
      required: true,
    },
    heroImg: {
      type: String,
      required: true,
    },
    highlight: { type: HighlightSchema, required: true, default: {} },

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

    tagBlogs: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: undefined },
    ],
    tagDestinations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Destination",
        default: undefined,
      },
    ],

    tagTours: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tour", default: undefined },
    ],

    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  }
);

// Indexes (no new fields)
MonthSchema.index({ status: 1, createdAt: -1 });
MonthSchema.index({ month: 1 }, { unique: true });
MonthSchema.index({ monthTag: 1 }, { unique: true });
MonthSchema.index({ month: "text", monthTag: "text" });

module.exports = mongoose.model("Month", MonthSchema);
