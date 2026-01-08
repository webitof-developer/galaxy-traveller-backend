// controllers/hero.controller.js
const Hero = require("../models/HeroSlide");
const { ok, fail, notFound, asyncHandler } = require("../utils/respond");

// helper: ensure singleton exists
async function getOrCreate() {
  let doc = await Hero.findOne();
  if (!doc) {
    doc = await Hero.create({
      heroSlide: [], // empty, will fail validation if you try to publish without 3 slides
      status: "draft",
    });
  }
  return doc;
}

// ---------- Public ----------
exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await Hero.findOne({ status: "published" }).lean();
  if (!doc) return notFound(res, "Hero not found");
  return ok(res, doc);
});

exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreate();
  return ok(res, doc.toObject());
});

// ---------- Moderation ----------
exports.getSingleton = asyncHandler(async (_req, res) => {
  const doc = await getOrCreate();
  return ok(res, doc.toObject ? doc.toObject() : doc);
});

// Update/replace slides and/or status
exports.updateSingleton = asyncHandler(async (req, res) => {
  const { heroSlide, status } = req.body || {};

  // ---------- CLEAN INPUT ----------
  const update = {};

  // Clean heroSlide only if it's a real array
  if (Array.isArray(heroSlide)) {
    const cleanedSlides = heroSlide.map((slide) => {
      const copy = { ...slide };
      delete copy.destination;
      delete copy.tour;
      delete copy.blog;
      delete copy.month;
      return copy;
    });

    update.heroSlide = cleanedSlides;
  }

  // Validate status only if provided
  const allowedStatus = ["draft", "published", "rejected"];
  if (status && allowedStatus.includes(status)) {
    update.status = status;
  }

  // If nothing valid was received → fail fast
  if (!Object.keys(update).length) {
    return fail(res, "No valid fields to update (heroSlide/status)", 400);
  }

  // ---------- UPDATE DATABASE ----------
  const doc = await Hero.findOneAndUpdate({}, update, {
    new: true,
    upsert: true,
    runValidators: true, // important for array length and ObjectId validation
  });

  // ---------- RESPONSE ----------
  return ok(res, doc.toObject ? doc.toObject() : doc);
});
