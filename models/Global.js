// models/Global.js
const mongoose = require("mongoose");
const { SEOSchema } = require("./Shared");

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

const GlobalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, default: "" },
    favicon: { type: String }, // keep as provided (URL string)
    description: { type: String, required: true, default: "" },
    defaultSeo: { type: SEOSchema },
    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "draft",
      index: true,
    },
    facebook: { type: String },
    twitter: { type: String },
    youtube: { type: String },
    instagram: { type: String },

    happyTravelers: { type: String },
    countries: { type: String },
    tourPackages: { type: String },
    yearsExperience: { type: String },

    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  }
);

// ensure unique index on the actual field name 'name'
GlobalSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Global", GlobalSchema);
