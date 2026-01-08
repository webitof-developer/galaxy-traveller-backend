// models/Testimonial.js (fixed; no new fields added)
const mongoose = require("mongoose");

// normalize output (id + extras flattening)
function transformOut(doc, ret) {
  if (ret.extras) {
    for (const [k, v] of Object.entries(ret.extras)) {
      if (ret[k] === undefined) ret[k] = v;
    }
    delete ret.extras;
  }
  ret.id = ret._id;
  delete ret._id;
  // __v already disabled by versionKey:false
  return ret;
}

const testimonialSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: [true, "Tour reference is required"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    place: { type: String, trim: true },
    travelType: {
      type: String,
      enum: ["Solo", "Family", "Friends", "Couple", "Group"],
      trim: true,
    },
    stars: {
      type: Number,
      min: [1, "Rating must be at least 1 star"],
      max: [5, "Rating must be at most 5 stars"],
    },
    date: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
    },
    review: { type: String, minlength: 10 },
    img: [
      {
        type: String,
      },
    ],
    profileImg: {
      type: String,
    },

    heading: {
      type: String,
    },

    description: { type: String, minlength: 10 },

    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

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

    tourCreatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  }
);

// Indexes
testimonialSchema.index({ status: 1, createdAt: -1 }); // latest-first by status
testimonialSchema.index({ tour: 1, createdAt: -1 });
testimonialSchema.index({ name: "text", place: "text", review: "text" }); // search

module.exports = mongoose.model("Testimonial", testimonialSchema);
