const PolicyPage = require("../models/PolicyPage");
const cache = require("../lib/cache/cache");
const POLICY_TTL = 3600; // policies/legal: 1–6 hours

// PUBLIC GET (no auth)
exports.getPublicPolicy = async (req, res) => {
  const cacheKey = "policy";
  const doc = await cache.getOrSet(cacheKey, POLICY_TTL, async () =>
    PolicyPage.findOne().lean()
  );
  cache.setCacheHeaders(res, POLICY_TTL);
  const payload = doc || { policies: "", terms: "" };
  return res.json(payload);
};

// ADMIN GET
exports.getAdminPolicy = async (req, res) => {
  const doc = await PolicyPage.findOne().lean();
  return res.json(doc || { policies: "", terms: "" });
};

// ADMIN UPDATE
exports.updateAdminPolicy = async (req, res) => {
  const { policies, terms } = req.body;

  let doc = await PolicyPage.findOne();
  if (!doc) doc = new PolicyPage();

  doc.policies = policies ?? doc.policies;
  doc.terms = terms ?? doc.terms;

  await doc.save();

  cache.del("policy");
  return res.json({ success: true, doc });
};
