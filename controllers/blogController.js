// controllers/blog.controller.js

const mongoose = require('mongoose');
const Blog = require('../models/Blog');
const User = require('../models/User');
const cache = require('../lib/cache/cache');

const {
  ok,
  created,
  notFound,
  fail,
  asyncHandler,
} = require('../utils/respond');

const { buildFolderPath } = require('../utils/pathbuilderandpublicurl');
const { deleteImageFromGCS, uploadImage } = require('../utils/uploadHelper');
const { notifyUser } = require('../utils/notifyUser');

const {
  isObjectId,
  coerceId,
  latestSort,
  parsePagination,
  buildSearch,
} = require('../utils/query');
const { populateGraphRelations } = require('../utils/relationHelper');
const { addRelation, removeRelation } = require('../utils/relation');
const { getRelationFields, RELATION_MAP } = require('../utils/relationMapper');

// MODEL MAP for graph population

// ---------- FILTER HELPERS ----------

const buildCommonFilters = (req) => {
  const f = {};

  if (req.query.status) f.status = req.query.status;

  if (req.query.createdBy) {
    const id = coerceId(req.query.createdBy);
    if (id) f.createdBy = id;
  }

  if (req.query.categories) {
    f.categories = { $in: req.query.categories.split(',') };
  }

  if (req.query.tagMonths) {
    f.tagMonths = { $in: req.query.tagMonths.split(',') };
  }

  return f;
};

function clean(obj) {
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined || v === null || v === '') delete obj[k];
    if (typeof v === 'object' && !Array.isArray(v)) clean(v);
  });
  return obj;
}

const BLOG_REL_DEFS = RELATION_MAP.Blog.relations;

const extractRelationInputs = (body = {}, defs = {}) => {
  const incoming = {};

  for (const field of Object.keys(defs)) {
    if (!(field in body)) continue;
    const raw = body[field];
    const arr = Array.isArray(raw) ? raw : [raw];
    incoming[field] = arr.filter(Boolean).map(String);
    delete body[field];
  }

  return incoming;
};

const syncRelations = async (id, incoming, defs, fromType) => {
  const graph = await populateGraphRelations(id);

  for (const [field, ids] of Object.entries(incoming)) {
    const cfg = defs[field];
    if (!cfg) continue;

    const existingIds =
      (graph[cfg.type] || []).map((r) => String(r._id || r.id)).filter(Boolean);

    const add = ids.filter((v) => !existingIds.includes(v));
    const remove = existingIds.filter((v) => !ids.includes(v));

    for (const toId of add) {
      await addRelation(cfg.kind, id, fromType, toId, cfg.type);
    }
    for (const toId of remove) {
      await removeRelation(cfg.kind, id, toId);
    }
  }

  const finalGraph = await populateGraphRelations(id);
  const fieldValues = {};

  for (const [field, cfg] of Object.entries(defs)) {
    fieldValues[field] =
      (finalGraph[cfg.type] || []).map((r) => String(r._id || r.id)) || [];
  }

  return fieldValues;
};

const LIST_TTL = 300; // lists: 2–5 minutes
const DETAIL_TTL = 900; // detail: 10–30 minutes

// ---------- PUBLIC LISTING ----------
exports.listPublished = asyncHandler(async (req, res) => {
  const qs = new URLSearchParams(req.query || {}).toString() || 'all';
  const cacheKey = `blogs:list:${qs}`;
  const payload = await cache.getOrSet(cacheKey, LIST_TTL, async () => {
    const { page, limit = 15, skip } = parsePagination(req);

    const filters = buildCommonFilters(req);
    const search = buildSearch(req.query.q);

    const where = { status: 'published', ...(filters || {}) };

    let createdBy = null;

    if (req.query.id) {
      const val = req.query.id;

      if (mongoose.Types.ObjectId.isValid(val)) {
        createdBy = await User.findById(val);
      } else {
        createdBy = await User.findOne({ slug: val });
      }

      if (createdBy) {
        where.createdBy = createdBy._id;
      }
    }

    if (search) Object.assign(where, search);

    const sort = { updatedAt: -1 };

    const [items, total] = await Promise.all([
      Blog.find(where).sort(sort).skip(skip).limit(limit).lean(),
      Blog.countDocuments(where),
    ]);

    for (const blog of items) {
      blog.relations = await populateGraphRelations(blog._id);
    }

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  cache.setCacheHeaders(res, LIST_TTL);
  return ok(res, payload);
});

// ---------- PUBLIC SINGLE ----------
exports.getBySlugOrId = asyncHandler(async (req, res) => {
  const p = req.params.idOrSlug;
  const where = isObjectId(p) ? { _id: p } : { slug: String(p).toLowerCase() };

  const cacheKey = `blogs:slug:${where._id || where.slug}`;
  const doc = await cache.getOrSet(cacheKey, DETAIL_TTL, async () => {
    const result = await Blog.findOne({ ...where, status: 'published' })
      .populate('categories')
      .populate('tagMonths')
      .populate('createdBy')
      .lean();

    if (!result) return null;

    const rawRelations = await populateGraphRelations(result._id);

    const fields = RELATION_MAP.Blog.relations;

    for (const [field, cfg] of Object.entries(fields)) {
      const type = cfg.type; // "Blog", "Destination",   etc.
      result[field] = rawRelations[type] || [];
    }

    return result;
  });

  if (!doc) return notFound(res, 'Blog not found');

  cache.setCacheHeaders(res, DETAIL_TTL);
  return ok(res, doc);
});

// ---------- MODERATION ----------
exports.listAll = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);

  const search = buildSearch(req.query.q, [
    'title',
    'slug',
    'description',
    'body',
    'author',
  ]);

  const filters = clean(buildCommonFilters(req));

  const where = { ...(filters || {}) };

  const role = (req.user?.roleName || req.user?.role || '').toLowerCase();
  if (role === 'creator') {
    where.createdBy = req.user._id;
  }

  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Blog.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Blog.countDocuments(where),
  ]);

  // Add graph relations
  for (const blog of items) {
    blog.relations = await populateGraphRelations(blog._id);
  }

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

exports.getOneModeration = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const doc = await Blog.findById(id).lean();
  if (!doc) return notFound(res, 'Blog not found');

  Object.assign(doc, await getRelationFields('Blog', doc._id));

  return ok(res, doc);
});

// ---------- MY BLOGS ----------
exports.listMyBlogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req);
  const sort = latestSort(req.query.sort);

  const where = { createdBy: req.user._id, ...buildCommonFilters(req) };

  const search = buildSearch(req.query.q, ['title', 'description', 'author']);
  if (search) Object.assign(where, search);

  const [items, total] = await Promise.all([
    Blog.find(where).sort(sort).skip(skip).limit(limit).lean(),
    Blog.countDocuments(where),
  ]);

  for (const blog of items) {
    blog.relations = await populateGraphRelations(blog._id);
  }

  return ok(res, {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// ---------- CREATE ----------
exports.create = asyncHandler(async (req, res) => {
  const createdBy = req.user?._id;

  const relationInputs = extractRelationInputs({ ...req.body }, BLOG_REL_DEFS);

  const payload = {
    ...req.body,
    createdBy,
  };

  // Sanitize strings
  ['title', 'slug', 'description', 'body', 'author'].forEach(k => {
    if (typeof payload[k] === 'string') payload[k] = payload[k].trim();
  });

  for (const field of Object.keys(relationInputs)) {
    delete payload[field];
  }

  const doc = await Blog.create(payload);

  if (Object.keys(relationInputs).length) {
    await syncRelations(doc._id, relationInputs, BLOG_REL_DEFS, 'Blog');
  }

  const graph = await populateGraphRelations(doc._id);
  for (const [field, cfg] of Object.entries(BLOG_REL_DEFS)) {
    doc[field] = (graph[cfg.type] || []).map((r) => r._id || r.id);
  }

  // Handle images (unchanged legacy support)
  if (req.files && req.files.length > 0) {
    const imageUrls = [];

    for (const file of req.files) {
      const folderPath = buildFolderPath({
        modelKey: 'blog',
        userId: req.user._id,
        recordId: doc._id,
      });

      const imageUrl = await uploadImage({
        folderPath,
        file,
        modelKey: 'blog',
        userId: req.user._id,
        recordId: doc._id,
      });

      imageUrls.push(imageUrl);
    }

    doc.images = imageUrls;
    await doc.save();
  }

  doc.relations = await populateGraphRelations(doc._id);

  cache.del('blogs:list:all');
  if (doc.slug) cache.del(`blogs:slug:${doc.slug}`);

  return created(res, doc.toObject());
});

// ---------- UPDATE ----------
exports.update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  let updates = { ...req.body };

  // Sanitize strings
  ['title', 'slug', 'description', 'body', 'author'].forEach(k => {
    if (typeof updates[k] === 'string') updates[k] = updates[k].trim();
  });
  const relationInputs = extractRelationInputs(updates, BLOG_REL_DEFS);
  delete updates.createdBy;
  delete updates.createdByRole;
  delete updates.rejectionReason;

  const existingBlog = await Blog.findById(id).select('status createdBy');
  if (!existingBlog) return notFound(res, 'Blog not found');

  // ================================
  // 1. Extract relation fields
  // ================================
  const UNI_REL_MAP = {
    destinations: 'destination',
    tours: 'tour',
    blogs: 'blog',
  };

  const incomingRelations = {};

  for (const field of Object.keys(UNI_REL_MAP)) {
    if (field in updates) {
      incomingRelations[field] = (updates[field] || []).map(String);
      delete updates[field]; // do not store inside blog
    }
  }

  // ================================
  // 2. Apply normal fields
  // ================================
  const updatedDoc = await Blog.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  ).lean();

  if (!updatedDoc) return notFound(res, 'Blog not found');

  if (Object.keys(relationInputs).length) {
    const relationValues = await syncRelations(
      id,
      relationInputs,
      BLOG_REL_DEFS,
      'Blog',
    );

    Object.assign(updatedDoc, relationValues);
  }

  cache.del('blogs:list:all');
  if (updatedDoc.slug) cache.del(`blogs:slug:${updatedDoc.slug}`);

  return ok(res, updatedDoc);
});

// ---------- STATUS UPDATE ----------
exports.updateStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const { status } = req.body || {};
  if (!['draft', 'published', 'rejected'].includes(status)) {
    return fail(res, 'Invalid status', 400);
  }

  const doc = await Blog.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true },
  ).lean();

  if (!doc) return notFound(res, 'Blog not found');

  doc.relations = await populateGraphRelations(doc._id);

  cache.del('blogs:list:all');
  if (doc.slug) cache.del(`blogs:slug:${doc.slug}`);

  return ok(res, doc);
});

// ---------- DELETE ----------
exports.remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const doc = await Blog.findByIdAndDelete(id).lean();
  if (!doc) return notFound(res, 'Blog not found');

  cache.del('blogs:list:all');
  if (doc.slug) cache.del(`blogs:slug:${doc.slug}`);

  return ok(res, { id });
});

// ---------- DUPLICATE ----------
exports.duplicate = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isObjectId(id)) return notFound(res, 'Invalid id');

  const original = await Blog.findById(id).lean();
  if (!original) return notFound(res, 'Blog not found');

  const duplicatedData = {
    ...original,
    _id: undefined,
    title: original.title ? `${original.title} (Copy)` : 'Untitled (Copy)',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (duplicatedData.slug)
    duplicatedData.slug = `${duplicatedData.slug}-copy-${Date.now()}`;

  if (duplicatedData.seo?.metaTitle)
    duplicatedData.seo.metaTitle = `${duplicatedData.seo.metaTitle} (Copy)`;

  if (duplicatedData.seo?.metaDescription)
    duplicatedData.seo.metaDescription = `${duplicatedData.seo.metaDescription} (Copy)`;

  delete duplicatedData.createdAt;
  delete duplicatedData.updatedAt;

  const duplicate = await Blog.create(duplicatedData);

  duplicate.relations = await populateGraphRelations(duplicate._id);

  return created(res, {
    message: 'Blog duplicated successfully',
    duplicate,
  });
});
