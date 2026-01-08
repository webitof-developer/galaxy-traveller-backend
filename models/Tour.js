const mongoose = require("mongoose");
const slugify = require("slugify");

const isURL = /^https?:\/\/[^\s]+$/i;
const time12h = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i;

// Sub-schemas for nested objects
const InclusionsSchema = new mongoose.Schema(
  {
    included: [{ type: String, required: true, trim: true }],
    excluded: [{ type: String, trim: true }],
  },
  { _id: false } // Disable _id for this schema
);

const MomentSchema = new mongoose.Schema(
  {
    img: {
      type: String,
      required: true,
    },
    altText: { type: String, minlength: 2, maxlength: 100 },
    description: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 180,
    },
  },
  { _id: false } // Disable _id for this schema
);

const ItinerarySchema = new mongoose.Schema(
  {
    day: { type: String, min: 1, required: true },
    blocks: [
      {
        time: {
          type: String,
          trim: true,
        },
        title: {
          type: String,
          required: true,
          minlength: 2,
          maxlength: 140,
        },
        activity: { type: String, minlength: 2, maxlength: 1000 },
        notes: { type: String, maxlength: 500 },
        image: {
          type: String,
        },
      },
    ],
  },
  { _id: false } // Disable _id for this schema
);

const StaySchema = new mongoose.Schema(
  {
    hotelName: { type: String, minlength: 2 },
    images: [{ type: String }],
    description: { type: String },
    address: { type: String },
    rating: { type: Number, min: 0, max: 5 },
  },
  { _id: false } // Disable _id for this schema
);

const FaqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 200,
    },
    answer: { type: String, required: true, minlength: 2, maxlength: 1500 },
  },
  { _id: false } // Disable _id for this schema
);

const HighlightSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, minlength: 2, maxlength: 120 },
    brief: { type: String, minlength: 2, maxlength: 500 },
    img: {
      type: String,
    },
  },
  { _id: false } // Disable _id for this schema
);

const DateRangeSchema = new mongoose.Schema(
  {
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { _id: false } // Disable _id for this schema
);

// Sub-schema for "details"
const DetailsSchema = new mongoose.Schema(
  {
    pricePerPerson: { type: Number, required: true, min: 1 },
    totalDays: { type: Number, required: true, min: 1 },
    duration: { type: String, required: true, trim: true },
    ageRestriction: { type: String, trim: true },
    groupSize: { type: String, trim: true },
  },
  { _id: false } // Disable _id for this schema
);

const TourSchema = new mongoose.Schema(
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
      index: true,
    },

    title: { type: String, required: true, minlength: 4, maxlength: 180 },

    place: { type: String, required: true, minlength: 1, maxlength: 50 },

    heroImg: {
      type: String,
      required: true,
    },

    galleryImgs: [{ type: String }],

    // Use the DetailsSchema here for the "details" field
    details: DetailsSchema,

    brief: { type: String, required: true, minlength: 5 },

    // Use the InclusionsSchema here
    inclusions: InclusionsSchema,

    // Use the MomentSchema here
    moments: [MomentSchema],

    description: {
      type: String,
      required: true,
      minlength: 8,
    },

    video: {
      type: [String],
      default: [],
    },

    // Use the ItinerarySchema here
    itinerary: [ItinerarySchema],

    // Use the StaySchema here
    stays: [StaySchema],

    // Use the FaqSchema here
    faqs: [FaqSchema],

    // Use the HighlightSchema here
    highlights: [HighlightSchema],

    mapEmbed: { type: String, trim: true, maxlength: 4000 },

    blogs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Blog" }],
    tours: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tour" }],

    tagMonths: [{ type: mongoose.Schema.Types.ObjectId, ref: "Month" }],

    testimonials: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Testimonial",
        index: true,
      },
    ],

    extras: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String },
      metaImage: {
        type: String,
      },
      keywords: [{ type: String, trim: true, maxlength: 40 }],
    },
    tourType: {
      type: String,
      enum: ["fixed_date", "selectable_date", "both"],
      required: true,
      default: "fixed_date",
    },

    // Use the DateRangeSchema here
    dateRange: DateRangeSchema,
    // Payment configuration
    paymentConfig: {
      type: new mongoose.Schema(
        {
          full: {
            enabled: { type: Boolean, default: true },
          },
          partial: {
            enabled: { type: Boolean, default: false },
            price: { type: Number, default: 0, min: 0 }, // FIXED PARTIAL PRICE
          },
        },
        { _id: false }
      ),
      default: () => ({
        full: { enabled: true },
        partial: { enabled: false, price: 0 },
      }),
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
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

// Nights vs Days sanity (if both present)
TourSchema.pre("validate", function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }

  if (
    this.priceTime?.nights &&
    Array.isArray(this.days) &&
    this.days.length > 0
  ) {
    const expectedNights = Math.max(this.days.length - 1, 1);
    if (this.priceTime.nights !== expectedNights) {
      // not throwing—just warn in logs; change to validation error if you want strictness
      console.warn(
        `[Tour] nights (${this.priceTime.nights}) != days-1 (${expectedNights}) for title=${this.title}`
      );
    }
  }

  next();
});

// --- Indexes ---
TourSchema.index({ status: 1, createdAt: -1 });

TourSchema.index({ status: 1, createdBy: 1, updatedAt: -1 });
TourSchema.index({
  title: "text",
  place: "text",
  brief: "text",
  description: "text",
  tourType: "text"
});
TourSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Tour", TourSchema);
