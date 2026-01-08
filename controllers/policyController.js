const PolicyPage = require("../models/PolicyPage");

// PUBLIC GET (no auth)
exports.getPublicPolicy = async (req, res) => {
  const doc = await PolicyPage.findOne().lean();
  return res.json(doc || { policies: "", terms: "" });
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

  return res.json({ success: true, doc });
};
