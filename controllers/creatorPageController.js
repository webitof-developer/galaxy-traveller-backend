const CreatorHome = require("../models/CreatorHome");
const { ok, notFound, fail, asyncHandler } = require("../utils/respond");

// --- Singleton helper ---
async function getOrCreateSingleton() {
  let doc = await CreatorHome.findOne();
  if (!doc) {
    doc = await CreatorHome.create({
      status: "draft",
      heroImage: "",
      happyCustomer: 0,
      creators: [],
      tours: [],
      blogs: [],
      testimonials: [],
      extras: {},
    });
  }
  return doc;
}

// ---------- Public ----------
exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await CreatorHome.findOne({ status: "published" })
    .populate("creators tours blogs")
    .lean();

  if (!doc) return notFound(res, "CreatorHome not found");
  return ok(res, doc);
});

// ---------- Moderation ----------
exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  return ok(res, doc.toObject());
});

exports.updateSingleton = asyncHandler(async (req, res) => {
  const allowed = new Set([
    "status",
    "heroImage",
    "happyCustomer",
    "creators",
    "tours",
    "blogs",
    "testimonials",
    "extras",
  ]);

  const payload = req.body || {};

  // --- Step 1: Normalize Payload ---
  const flatSet = {};
  const fullReplace = {}; // full overwrite for arrays and root fields

  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;

    // --- handle extras ---
    if (key === "extras" && typeof value === "object" && value !== null) {
      for (const [ek, ev] of Object.entries(value)) {
        if (ev === undefined) continue;
        flatSet[`extras.${ek}`] = ev;
      }
      continue;
    }

    // --- arrays should overwrite entirely ---
    if (Array.isArray(value)) {
      fullReplace[key] = value;
      continue;
    }

    // --- primitive or object field ---
    flatSet[key] = value;
  }

  // --- Step 2: Merge all update ops safely ---
  const updateOps = {};
  if (Object.keys(flatSet).length > 0) updateOps.$set = { ...flatSet };
  if (Object.keys(fullReplace).length > 0)
    updateOps.$set = { ...(updateOps.$set || {}), ...fullReplace };

  if (Object.keys(updateOps).length === 0) {
    return fail(res, "No valid fields to update", 400);
  }

  // --- Step 3: Prepare $setOnInsert safely ---
  const setOnInsertDefaults = {
    status: "draft",
    heroImage: "",
    happyCustomer: 0,
    creators: [],
    tours: [],
    blogs: [],
    testimonials: [],
    extras: {},
  };

  // remove overlaps between $set and $setOnInsert
  for (const key of Object.keys(updateOps.$set || {})) {
    delete setOnInsertDefaults[key];
  }

  // --- Step 4: Perform atomic upsert ---
  const doc = await CreatorHome.findOneAndUpdate(
    {},
    {
      ...updateOps,
      $setOnInsert: setOnInsertDefaults,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      overwrite: false,
      context: "query",
    }
  )
    .populate("creators tours blogs")
    .lean();

  return ok(res, doc);
});
