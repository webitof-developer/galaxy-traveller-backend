// models/Category.js (fixed)
const mongoose = require('mongoose');

// flatten extras + normalize id in output
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

const CategorySchema = new mongoose.Schema(
  {
    tag: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 180,
      trim: true,
      lowercase: true,
      unique: true, // avoid duplicate category tags
      index: true,
    },
    description: {
      type: String,
      minlength: 3,
      maxlength: 800,
    },
    blogs: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', default: undefined },
    ],
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
    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  },
);

// indexes
CategorySchema.index({ status: 1, createdAt: -1 });
CategorySchema.index({ tag: 'text', description: 'text' }); // for q search

module.exports = mongoose.model('Category', CategorySchema);
