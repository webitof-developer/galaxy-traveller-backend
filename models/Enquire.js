const mongoose = require("mongoose");

const EnquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    adults: { type: Number, default: 0 },
    children: { type: Number, default: 0 },

    totalPeople: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },

    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: [true, "Tour reference is required"],
    },

    status: {
      type: String,
      enum: ["published", "draft", "rejected"],
      default: "draft",
    },
  },
  { timestamps: true }
);

// auto-compute totalPeople before save
EnquirySchema.pre("save", function (next) {
  this.totalPeople = (this.adults || 0) + (this.children || 0);
  next();
});

EnquirySchema.index({ tourCreatedBy: 1, createdAt: -1 });
EnquirySchema.index({ status: 1, tourCreatedBy: 1, updatedAt: -1 });

module.exports = mongoose.model("Enquiry", EnquirySchema);
