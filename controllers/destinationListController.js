// controllers/listDestination.controller.js
const ListDestination = require('../models/DestinationList');
const { ok, fail, notFound, asyncHandler } = require('../utils/respond');
const { isObjectId } = require('../utils/query');
const Relation = require('../models/Relation');
const cache = require('../lib/cache/cache');
const TTL_SECONDS = 600; // globals/settings: 5–15 minutes
const CACHE_KEY = 'site:destinations:list';

async function getOrCreateSingleton() {
  let doc = await ListDestination.findOne();
  if (!doc) doc = await ListDestination.create({ group: [], status: 'draft' });
  return doc;
}

exports.getSingletonModeration = asyncHandler(async (_req, res) => {
  const doc = await getOrCreateSingleton();
  return ok(res, doc.toObject());
});

exports.getPublished = asyncHandler(async (_req, res) => {
  const doc = await cache.getOrSet(CACHE_KEY, TTL_SECONDS, async () => {
    const result = await ListDestination.findOne({ status: 'published' })
      .populate({
        path: 'group.destinations',
        model: 'Destination',
        select: 'title heroImg slug status startingPrice description tagMonths',
        populate: {
          path: 'tagMonths',
          model: 'Month',
          select: 'month',
        },
      })
      .lean();
    if (!result) return null;

    // Compute tour counts per destination using relation edges (destination_tour)
    const allDestinations =
      result?.group?.flatMap((g) => g?.destinations || []) || [];
    const destIds = [
      ...new Set(
        allDestinations
          .map((d) => String(d?._id || d?.id || d || ''))
          .filter(Boolean),
      ),
    ];

    if (destIds.length) {
      const mongoose = require('mongoose');
      const destObjIds = destIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      const rels = await Relation.find({
        kind: 'destination_tour',
        $or: [
          { 'from.id': { $in: destObjIds } },
          { 'to.id': { $in: destObjIds } },
        ],
      }).lean();

      const countMap = {};
      const idSet = new Set(destIds);

      for (const r of rels) {
        const fromId = String(r.from.id);
        const toId = String(r.to.id);

        // Count only edges where one side is destination and the other is tour
        if (
          r.from.type === 'Destination' &&
          r.to.type === 'Tour' &&
          idSet.has(fromId)
        ) {
          countMap[fromId] = (countMap[fromId] || 0) + 1;
        } else if (
          r.to.type === 'Destination' &&
          r.from.type === 'Tour' &&
          idSet.has(toId)
        ) {
          countMap[toId] = (countMap[toId] || 0) + 1;
        }
      }

      if (Array.isArray(result.group)) {
        result.group = result.group.map((group) => ({
          ...group,
          destinations: (group?.destinations || []).map((d) => {
            const id = String(d?._id || d?.id || d || '');
            if (!id) return d;
            const simplifiedMonths = Array.isArray(d?.tagMonths)
              ? d.tagMonths.map((m) =>
                  m?.month
                    ? { month: m.month, monthTag: m.monthTag || m.month }
                    : m?.monthTag
                    ? { month: m.monthTag, monthTag: m.monthTag }
                    : m,
                )
              : [];
            return {
              ...d,
              tourCount: countMap[id] || 0,
              tagMonths: simplifiedMonths,
            };
          }),
        }));
      }
    }

    return result;
  });

  if (!doc) return notFound(res, 'ListDestination not found');

  cache.setCacheHeaders(res, TTL_SECONDS);
  return ok(res, doc);
});

exports.updateSingleton = asyncHandler(async (req, res) => {
  const { group, status, ops } = req.body || {};
  const doc = await getOrCreateSingleton();
  let mutated = false;

  // full replace of group (index 0)
  if (Array.isArray(group)) {
    doc.group = group;
    mutated = true;
  }

  // top-level status
  if (status) {
    if (!['draft', 'published', 'rejected'].includes(status))
      return fail(res, 'Invalid status', 400);
    doc.status = status;
    mutated = true;
  }

  // ops: only update/status allowed
  if (Array.isArray(ops) && ops.length) {
    if (!Array.isArray(doc.group) || !Array.isArray(doc.group[0]))
      return fail(res, 'Group is empty; nothing to update', 400);

    const g = doc.group[0];
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
        400,
      );
    }
  }

  if (!mutated) return fail(res, 'No valid changes provided', 400);
  await doc.save();
  cache.del(CACHE_KEY);
  return ok(res, doc.toObject());
});
