// middleware/ensurePermission.js
const mongoose = require("mongoose");
const Role = require("../models/Role");
const respond = require("../utils/respond");
const Blog = require("../models/Blog");
const Category = require("../models/Category");
const Destination = require("../models/Destination");
const Flyer = require("../models/Flyer");
const Lead = require("../models/Lead");
const Month = require("../models/Month");
const Testimonial = require("../models/Testimonial");
const Tour = require("../models/Tour");
const User = require("../models/User");
const DestinationList = require("../models/DestinationList");
const Features = require("../models/Features");
const Global = require("../models/Global");
const HeroSlide = require("../models/HeroSlide");
const Review = require("../models/Review");
const Policy = require("../models/PolicyPage");
const Booking = require("../models/Booking");

const models = {
  users: User,
  roles: Role,
  blog: Blog,
  categories: Category,
  destinations: Destination,
  flyers: Flyer,
  lead: Lead,
  month: Month,
  testimonial: Testimonial,
  tour: Tour,
  site_destinationslist: DestinationList,
  site_features: Features,
  site_global: Global,
  site_heroslides: HeroSlide,
  review: Review,
  policy: Policy,
  booking: Booking,
};

const SINGLETON_MODELS = new Set([
  "site_destinationslist",
  "site_features",
  "site_global",
  "site_heroslides",
  "site_tourlist",
  "review", // add only if truly singleton in your case
]);

function isAdminUser(user) {
  const rn = user?.roleName?.toLowerCase?.();
  const r =
    typeof user?.role === "string" ? user.role.toLowerCase() : user?.role;
  // console.log(rn, r);

  return rn === "admin" || r === "admin";
}

function getDecisionFromRoleDoc(roleDoc, modelKey, action) {
  const key = String(modelKey || "").toLowerCase();
  const perms = roleDoc?.permissions || {};
  const lowered = {};
  for (const [k, v] of Object.entries(perms)) lowered[k.toLowerCase()] = v;

  const wild = lowered["*"];
  const exact = lowered[key];
  return (exact && exact[action]) ?? (wild && wild[action]) ?? false;
}

async function getDecision(user, modelKey, action) {
  if (!user) return false;
  if (isAdminUser(user)) return "any";
  // console.log("getDecision", user, modelKey, action);

  let roleDoc = null;

  const roleId = user.roleId || user.role_id;
  if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
    roleDoc = await Role.findById(roleId).lean();
  }
  if (!roleDoc) {
    const roleName =
      user.roleName || (typeof user.role === "string" ? user.role : undefined);
    if (roleName) roleDoc = await Role.findOne({ name: roleName }).lean();
  }

  if (!roleDoc) return false;
  return getDecisionFromRoleDoc(roleDoc, modelKey, action);
}

function hasOwnerField(Model, ownerField) {
  return !!Model?.schema?.path(ownerField);
}

function resolveIdParam(req, keys = ["idOrSlug", "id", "slug"]) {
  for (const k of keys) {
    if (req.params[k]) return req.params[k];
  }
  return null;
}

/**
 * ensurePermission(action, explicitModelKey?, opts?)
 *
 * - Uses role permission if granted.
 * - If denied and model has `createdBy`, owners can update/delete their own docs.
 * - Admin bypasses everything.
 * - Uses respond.ok / respond.notFound / respond.fail for all responses.
 */
function ensurePermission(action, explicitModelKey, opts = {}) {
  const { ownerField = "createdBy", idParamKeys = ["idOrSlug", "id", "slug"] } =
    opts;

  return async function (req, res, next) {
    try {
      const needsResourceCheck = action === "update" || action === "delete";
      // console.log(
      //   "ensurePermission5",
      //   action,
      //   explicitModelKey,
      //   needsResourceCheck
      // );

      // Admin bypass
      if (isAdminUser(req.user)) {
        req.authz = { action, decision: true, scope: "any", via: "admin" };
        return next();
      }

      const modelKey = (
        explicitModelKey ||
        req.params.modelKey ||
        req.params.key ||
        ""
      ).toLowerCase();

      if (!modelKey) {
        return respond.fail(res, "modelKey missing", 400);
      }

      const baseDecision = await getDecision(req.user, modelKey, action);
      // console.log("ensurePermission", baseDecision);

      // For actions that don't target a single resource (read list/create)
      if (!needsResourceCheck) {
        if (!baseDecision) return respond.fail(res, "Forbidden", 403);
        req.authz = { action, decision: true, scope: "any", via: "role" };
        return next();
      }

      // update/delete require fetching the resource
      let Model = models[modelKey];
      if (!Model) return respond.fail(res, `Unknown model: ${modelKey}`, 400);

      let doc = null;
      const identifier = resolveIdParam(req, idParamKeys);

      if (!identifier && SINGLETON_MODELS.has(modelKey)) {
        // ✅ handle singleton: fetch the one existing document
        doc = await Model.findOne().lean();
      } else {
        if (!identifier) {
          return respond.fail(res, "Resource identifier missing", 400);
        }
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
        const query = isObjectId ? { _id: identifier } : { slug: identifier };
        doc = await Model.findOne(query).lean();
      }

      if (!doc) return respond.notFound(res);

      // Attach for downstream handlers
      req.resource = doc;

      // If role already allows, allow
      if (baseDecision === true || baseDecision === "any") {
        req.authz = { action, decision: true, scope: "any", via: "role" };
        return next();
      }

      // Owner override auto-applies only if the model really has `createdBy`
      if (hasOwnerField(Model, ownerField)) {
        const ownerId = doc?.[ownerField];
        const userId = req.user?._id;
        if (ownerId && userId && String(ownerId) === String(userId)) {
          req.authz = {
            action,
            decision: true,
            scope: "own",
            via: "owner-override",
          };
          return next();
        }
      }

      // Denied
      return respond.fail(res, "Forbidden", 403);
    } catch (e) {
      console.error("ensurePermission error", e);
      return respond.fail(res, e, 500);
    }
  };
}

module.exports = { ensurePermission };
