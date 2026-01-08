// controllers/listReview.controller.js  (assumes a singleton model with `review: []` field)
const ListReview = require('../models/Review');
const { ok, fail, notFound, asyncHandler } = require('../utils/respond');
const { isObjectId } = require('../utils/query');

async function getOrCreateSingleton() {
  let doc = await ListReview.findOne();
  if (!doc) doc = await ListReview.create({ review: [], status: 'published' });
  return doc;
}

exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await ListReview.findOne({ status: 'published' }).lean();
  if (!doc) return notFound(res, 'ListReview not found');
  return ok(res, doc);
});

exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  return ok(res, doc.toObject());
});

exports.getSingleton = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  if (!doc) return notFound(res, 'ListReview not found');
  return ok(res, doc);
});

exports.updateSingleton = asyncHandler(async (req, res) => {
  const { group, status, ops } = req.body || {};
  const doc = await getOrCreateSingleton();
  let mutated = false;

  // full replace of the array
  if (Array.isArray(group)) {
    doc.group = group;
    mutated = true;
  }

  if (status) {
    if (!['draft', 'published', 'rejected'].includes(status))
      return fail(res, 'Invalid status', 400);
    doc.status = status;
    mutated = true;
  }

  if (Array.isArray(ops) && ops.length) {
    if (!Array.isArray(doc.group))
      return fail(res, 'Review list is empty; nothing to update', 400);

    const arr = doc.group;
    for (const op of ops) {
      const kind = String(op?.op || '').toLowerCase();

      if (kind === 'status') {
        const v = op?.value;
        if (!['draft', 'published', 'rejected'].includes(v))
          return fail(res, 'ops.status: invalid value', 400);
        doc.status = v;
        mutated = true;
        continue;
      }

      if (kind === 'update') {
        const id = op?.itemId;
        const patch = op?.patch || {};
        if (!isObjectId(id))
          return fail(res, 'ops.update: valid itemId required', 400);
        const idx = arr.findIndex((it) => String(it?._id) === String(id));
        if (idx === -1)
          return fail(res, `ops.update: item ${id} not found`, 404);
        delete patch._id;
        delete patch.id;
        Object.assign(arr[idx], patch);
        mutated = true;
        continue;
      }

      return fail(
        res,
        `Unsupported op '${kind}'. Only 'update' and 'status' are allowed.`,
        400,
      );
    }
  }

  if (!mutated) return fail(res, 'No valid changes provided', 400);
  await doc.save();
  return ok(res, doc.toObject());
});
