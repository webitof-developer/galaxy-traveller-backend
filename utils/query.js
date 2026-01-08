// utils/query.js
const mongoose = require('mongoose');

// ----- ID helpers (TS-safe; no deprecated ctor) -----
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);
const coerceId = (v) =>
  isObjectId(v) ? mongoose.Types.ObjectId.createFromHexString(String(v)) : null;

// ----- pagination & sort -----
const latestSort = (sortStr) => {
  if (!sortStr) return { createdAt: -1, _id: -1 };
  const sort = {};
  String(sortStr)
    .split(',')
    .forEach((s) => {
      s = s.trim();
      if (!s) return;
      if (s.startsWith('-')) sort[s.slice(1)] = -1;
      else sort[s] = 1;
    });
  if (!('_id' in sort)) sort._id = -1; // stable tiebreaker
  return sort;
};

const parsePagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

// ----- search (regex across fields) -----
// Usage: buildSearch(req.query.q, ["title","slug","description"])
const buildSearch = (q, fields = []) => {
  if (!q) return null;
  const safe = String(q)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!safe) return null;
  const rx = new RegExp(safe, 'i');
  const ors = fields.map((f) => ({ [f]: rx }));
  return ors.length ? { $or: ors } : null;
};

// ----- CSV -> ObjectId array helper -----
// Usage: const blogIds = csvObjectIds(req.query.blogs); if (blogIds) f.blogs = {$in: blogIds}
const csvObjectIds = (val) => {
  if (!val && val !== 0) return null;
  const arr = String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(coerceId)
    .filter(Boolean);
  return arr.length ? arr : null;
};

// ----- date range (createdAt by default) -----
// Usage: applyDateRange(f, req, "createdAt")
const applyDateRange = (filterObj, req, field = 'createdAt') => {
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) {
    const r = {};
    if (from && !Number.isNaN(from.getTime())) r.$gte = from;
    if (to && !Number.isNaN(to.getTime())) r.$lte = to;
    if (Object.keys(r).length) filterObj[field] = r;
  }
  return filterObj;
};

module.exports = {
  isObjectId,
  coerceId,
  latestSort,
  parsePagination,
  buildSearch,
  csvObjectIds,
  applyDateRange,
};
