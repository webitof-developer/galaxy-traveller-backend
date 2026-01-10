// controllers/featured.controller.js (singleton)
const Featured = require("../models/Features");
const { ok, notFound, fail, asyncHandler } = require("../utils/respond");
const cache = require("../lib/cache/cache");
const TTL_SECONDS = 600; // globals/settings: 5–15 minutes
const CACHE_KEY = "site:features";
async function getOrCreateSingleton() {
  let doc = await Featured.findOne();
  if (!doc) doc = await Featured.create({ group: [], status: "draft" });
  return doc;
}
// Public: return the single published Featured doc
exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await cache.getOrSet(CACHE_KEY, TTL_SECONDS, async () =>
    Featured.findOne({ status: "published" }).lean()
  );
  if (!doc) return notFound(res, "Featured not found");
  cache.setCacheHeaders(res, TTL_SECONDS);
  return ok(res, doc);
});

exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  return ok(res, doc.toObject());
});

/**
 * Moderation: single updater (admin/authorized only)
 * Supports:
 * - Full replace: { blogs:[], destinations:[],    tours:[], traveller:[], status:"draft|published|rejected" }
 * - Partial updates: send only the fields you want to change (same keys as above)
 *
 * Implementation uses findOneAndUpdate({}, $set, { upsert:true, new:true }).
 */
exports.updateSingleton = asyncHandler(async (req, res) => {
  const allowedKeys = [
    "blogs",
    "destinations",
    " tours",
    "traveller",
    "status",
  ];
  const update = {};
  for (const k of allowedKeys) {
    if (k in req.body) update[k] = req.body[k];
  }

  // optional: validate status value if provided
  if ("status" in update) {
    const v = update.status;
    if (!["draft", "published", "rejected"].includes(v)) {
      return fail(res, "Invalid status", 400);
    }
  }

  if (!Object.keys(update).length)
    return fail(res, "No valid fields to update", 400);

  const doc = await Featured.findOneAndUpdate({}, update, {
    new: true,
    upsert: true,
    runValidators: true,
  }).lean();

  cache.del(CACHE_KEY);
  return ok(res, doc);
});
