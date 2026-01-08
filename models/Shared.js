const mongoose = require("mongoose");

// -------------------- Hero Schema --------------------
const HeroSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: "" },
    img: { type: String, required: true, default: "" },
  },
  { _id: false }
);

// -------------------- Plan Schema --------------------
const PlanSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: "" },
    img: { type: String, required: true, default: "" },
  },
  { _id: false }
);

// -------------------- Moment Schema --------------------
const MomentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: "" },
    description: { type: String, minlength: 8, maxlength: 500, default: "" },
    img: { type: String, required: true, default: "" },
  },
  { _id: false }
);

// -------------------- Testimonial Schema --------------------
const TestimonialSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    place: { type: String, default: "" },
    travelType: { type: String, default: "" },
    date: { type: String, default: "" },
    review: { type: String, maxlength: 240, default: "" },
    heading: { type: String, default: "" },
    img: { type: [String], default: [] },
    description: { type: String, maxlength: 240, default: "" },
    stars: { type: Number, min: 1, max: 5, default: 5 },
    profileImg: { type: String, default: "" },
  },
  { _id: false }
);

// -------------------- Highlight Schema --------------------
const HighlightSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      minlength: 4,
      default: "",
    },
    brief: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 800,
      default: "",
    },
    img: { type: String, required: true, default: "" },
  },
  { _id: false }
);

// -------------------- SEO Schema --------------------
// ⚠️ Removed `unique: true` from meta fields — not appropriate for SEO meta texts.
const SEOSchema = new mongoose.Schema(
  {
    metaTitle: { type: String, required: true, default: "" },
    metaDescription: {
      type: String,
      required: true,
      default: "",
    },
    shareImage: { type: String, default: "" },
  },
  { _id: false }
);

// -------------------- HeroSlide Schema --------------------
const HeroSlideSchema = new mongoose.Schema(
  {
    heroImg: { type: String, required: true, default: "" },
    title: {
      type: String,
      required: true,
      minlength: 4,
      maxlength: 70,
      default: "",
    },
    url: { type: String, required: true, default: "" },
    description: {
      type: String,
      required: true,
      minlength: 4,
      default: "",
    },
    cta: { type: String, maxlength: 38, default: '' },
    destination: { type: mongoose.Schema.Types.Mixed, select: false },
    tour: { type: mongoose.Schema.Types.Mixed, select: false },
    blog: { type: mongoose.Schema.Types.Mixed, select: false },
    month: { type: mongoose.Schema.Types.Mixed, select: false },
    tour: { type: mongoose.Schema.Types.ObjectId, ref: "Tour", default: null },

    blog: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: null },
    month: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Month",
      default: null,
    },
  },
  { _id: false }
);

// -------------------- DestinationGroup Schema --------------------
const DestinationGroupSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 120,
      default: "",
    },
    destinations: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Destination",
      default: [],
    },
  },
  { _id: false }
);

// -------------------- TourGroup Schema --------------------
const TourGroupSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, minlength: 2, default: "" },
    tours: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Tour",
      default: [],
    },
  },
  { _id: false }
);

// -------------------- Review Schema --------------------
const ReviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: "" },
    place: { type: String, default: "" },
    travelType: { type: String, default: "" },
    date: { type: String, default: "" },
    review: { type: String, minlength: 10, maxlength: 240, default: "" },
    description: { type: String, maxlength: 240, default: "" },
    stars: { type: Number, min: 1, max: 5, default: 5 },
    img: { type: String, required: true, default: "" },
    profileImg: { type: String, default: "" },
    source: { type: String, default: "google" },
  },
  { _id: false }
);

// -------------------- Exports --------------------
module.exports = {
  HeroSchema,
  PlanSchema,
  HeroSlideSchema,
  HighlightSchema,
  DestinationGroupSchema,
  TourGroupSchema,
  SEOSchema,
  MomentSchema,
  ReviewSchema,
  TestimonialSchema,
};
