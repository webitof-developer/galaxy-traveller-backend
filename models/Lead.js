// models/Lead.js (fixed transform only; schema fields unchanged)
const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 2, maxlength: 200 },
    email: {
      type: String,
      minlength: 3,
      maxlength: 200,
      match: /^\S+@\S+\.\S+$/,
    },
    contact: { type: String, required: true, trim: true },
    countryCode: { type: String, required: true, minlength: 1, maxlength: 6 },
    month: { type: String, maxlength: 100 },
    year: { type: Number, max: 3030 },
    duration: { type: String, maxlength: 120 },
    people: { type: Number, required: true, min: 1, max: 500 },
    budget: { type: Number, min: 1, max: 9999999999 },
    comment: { type: String, maxlength: 999 },
    destination: { type: String, minlength: 1 },
    source: { type: String, minlength: 1 },
    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['draft', 'published', 'rejected'],
      default: 'draft',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  },
);

// Flatten extras + normalize id in output
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

LeadSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', LeadSchema);
