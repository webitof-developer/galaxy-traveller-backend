// controllers/listTour.controller.js
const ListTour = require("../models/TourList");
const { ok, fail, notFound, asyncHandler } = require("../utils/respond");
const { isObjectId } = require("../utils/query");

async function getOrCreateSingleton() {
  let doc = await ListTour.findOne();
  if (!doc) doc = await ListTour.create({ group: [], status: "published" });
  return doc;
}

exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await ListTour.findOne({ status: "published" }).lean();
  if (!doc) return notFound(res, "ListTour not found");
  return ok(res, doc);
});

exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  return ok(res, doc.toObject());
});

exports.updateSingleton = asyncHandler(async (req, res) => {
  const { group, status, ops } = req.body || {};
  const doc = await getOrCreateSingleton();
  let mutated = false;

  if (Array.isArray(group)) {
    doc.group = group;
    mutated = true;
  }

  if (status) {
    if (!["draft", "published", "rejected"].includes(status))
      return fail(res, "Invalid status", 400);
    doc.status = status;
    mutated = true;
  }

  if (Array.isArray(ops) && ops.length) {
    if (!Array.isArray(doc.group) || !Array.isArray(doc.group[0]))
      return fail(res, "Group is empty; nothing to update", 400);

    const g = doc.group[0];
    for (const op of ops) {
      const kind = String(op?.op || "").toLowerCase();

      if (kind === "status") {
        const v = op?.value;
        if (!["draft", "published", "rejected"].includes(v))
          return fail(res, "ops.status: invalid value", 400);
        doc.status = v;
        mutated = true;
        continue;
      }

      if (kind === "update") {
        const id = op?.itemId;
        const patch = op?.patch || {};
        if (!isObjectId(id))
          return fail(res, "ops.update: valid itemId required", 400);
        const idx = g.findIndex((it) => String(it?._id) === String(id));
        if (idx === -1)
          return fail(res, `ops.update: item ${id} not found`, 404);
        delete patch._id;
        delete patch.id;
        Object.assign(g[idx], patch);
        mutated = true;
        continue;
      }

      return fail(
        res,
        `Unsupported op '${kind}'. Only 'update' and 'status' are allowed.`,
        400
      );
    }
  }

  if (!mutated) return fail(res, "No valid changes provided", 400);
  await doc.save();
  return ok(res, doc.toObject());
});
