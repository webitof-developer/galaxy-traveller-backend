// models/ListDestination.js
const mongoose = require('mongoose');
const { DestinationGroupSchema } = require('./Shared');

// normalize output (id + extras flattening if present in future)
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

const ListDestinationSchema = new mongoose.Schema(
  {
    group: {
      type: [DestinationGroupSchema], // we will use ONLY the first group (index 0)
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'rejected'],
      default: 'published',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  },
);

ListDestinationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ListDestination', ListDestinationSchema);
