// controllers/global.controller.js (fixed conflicting update)
const Global = require("../models/Global");
const { ok, notFound, fail, asyncHandler } = require("../utils/respond");

async function getOrCreateSingleton() {
  let doc = await Global.findOne();
  if (!doc) {
    doc = await Global.create({
      name: "Global",
      description: "Site-wide defaults",
      status: "draft",
    });
  }
  return doc;
}

exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await Global.findOne({ status: "published" }).lean();
  if (!doc) return notFound(res, "Global not found");
  return ok(res, doc);
});

exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  return ok(res, doc.toObject());
});

exports.updateSingleton = asyncHandler(async (req, res) => {
  const aliasMap = {
    siteName: "name",
    siteDescription: "description",
  };

  const allowed = new Set([
    "name",
    "description",
    "favicon",
    "defaultSeo",
    "status",
    "extras",
    "siteName",
    "siteDescription",
    "facebook",
    "twitter",
    "youtube",
    "instagram",
    "linkedin",
    "happyTravelers",
    "countries",
    "tourPackages",
    "yearsExperience",
  ]);

  // Build the $set doc, mapping aliases → real fields
  const setDoc = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.has(k)) continue;
    const targetKey = aliasMap[k] || k;
    setDoc[targetKey] = v;
  }

  if (Object.keys(setDoc).length === 0) {
    return fail(res, "No valid fields to update", 400);
  }

  // Build setOnInsert only for keys not present in setDoc to avoid conflicts
  const setOnInsert = {};
  if (!("name" in setDoc)) setOnInsert.name = "Global";
  if (!("description" in setDoc))
    setOnInsert.description = "Site-wide defaults";
  // Add any other guaranteed fields you'd like on insert, only if not provided:
  // e.g. if you need a default status on first insert but allow updating status, only include when not present
  if (!("status" in setDoc)) setOnInsert.status = "draft";

  const updateDoc = { $set: setDoc };
  if (Object.keys(setOnInsert).length > 0) {
    updateDoc.$setOnInsert = setOnInsert;
  }

  const doc = await Global.findOneAndUpdate({}, updateDoc, {
    new: true,
    upsert: true,
    runValidators: true,
    context: "query",
  });

  if (!doc) return fail(res, "Failed to update Global", 500);
  return ok(res, doc.toObject());
});
