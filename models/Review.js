// models/Review.js  (keeps your fields; adds stable id + helpful index)
const mongoose = require("mongoose");
const { ReviewSchema } = require("./Shared");

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

const ReviewContentSchema = new mongoose.Schema(
  {
    group: { type: [ReviewSchema], default: [] }, // embedded array
    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "published",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformOut },
    toObject: { virtuals: true, transform: transformOut },
  }
);

// latest-first index for published fetch
ReviewContentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Review", ReviewContentSchema);
