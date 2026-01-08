const mongoose = require("mongoose");
const User = require("../models/User");
const Role = require("../models/Role");
const Blog = require("../models/Blog");
const Tour = require("../models/Tour");

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

const sanitize = (u) => {
  if (!u) return null;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    roleId: u.roleId,
    roleName: u.roleName,
    status: u.status,
    // add profile fields
    profileImg: u.profileImg,
    backgroundImg: u.backgroundImg,
    bio: u.bio,
    location: u.location,
    social: u.social,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
};
// src/controllers/user.controller.js
exports.me = async (req, res) => {
  const u = req.user;
  // console.log(`user:${u}`);

  if (!u) return res.status(401).json({ message: "Unauthorized" });
  res.json({
    _id: u._id,
    name: u.name,
    email: u.email,
    profileImg: u.profileImg,
    roleId: u.roleId,
    roleName: u.roleName,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });
};

// GET /api/users
exports.list = async (req, res) => {
  try {
    const { q, status, page = 1, limit = 20, rolename } = req.query;
    // console.log(`filter: ${JSON.stringify(req.query)}`);

    const filter = {};
    if (q)
      filter.$or = [
        { name: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
      ];
    if (status) filter.status = status;

    // console.log(`filter22: ${rolename}`);
    if (rolename) {
      filter.roleName = rolename;
    }

    // "own" scope => only current user
    if (req.authz?.decision === "own") {
      filter._id = req.user._id;
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l),
      User.countDocuments(filter),
    ]);

    res.json({ items: items.map(sanitize), total, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.profileById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });
    const user = await User.findById(id).select(
      "name email profileImg backgroundImg bio location social createdAt"
    );
    const blog = await Blog.find({
      createdBy: id,
      status: "published",
    }).select("title slug status createdAt displayImg");
    const tour = await Tour.find({
      createdBy: id,
      status: "published",
    }).select("title slug status createdAt displayImg brief heroImg details");
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json({
      user,
      blog,
      tour,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.profile = async (req, res) => {
  try {
    const { id } = req.params;

    // Determine query type
    const userQuery = isObjectId(id) ? { _id: id } : { slug: id };

    console.log("userQuery", userQuery);

    // Fetch user basic info
    const user = await User.findOne(userQuery).select(
      "name email profileImg backgroundImg bio location social createdAt"
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch published blogs by this user
    const blog = await Blog.find({
      createdBy: user._id,
      status: "published",
    })
      .select("title slug status createdAt displayImg createdBy")
      .limit(3);

    const totalBlog = await Blog.countDocuments({
      createdBy: user._id,
      status: "published",
    });

    // Fetch published tours by this user
    const tour = await Tour.find({
      createdBy: user._id,
      status: "published",
    }).select("title slug status createdAt displayImg brief heroImg details");

    const totalTour = await Tour.countDocuments({
      createdBy: user._id,
      status: "published",
    });
    // Return combined profile data
    return res.json({
      user,
      blog,
      tour,
      totalBlog,
      totalTour,
    });
  } catch (e) {
    console.error("Error in profile controller:", e);
    return res.status(500).json({ message: e.message });
  }
};

// GET /api/users/:id
exports.get = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    // // "own" scope => can only read self
    // if (req.authz?.decision === "own" && String(id) !== String(req.user._id)) {
    //   return res.status(403).json({ message: "Forbidden (own scope)" });
    // }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json(sanitize(user));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// POST /api/users
exports.create = async (req, res) => {
  try {
    const { name, email, roleId, roleName, status } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ message: "name and email are required" });
    }

    // Resolve role (by roleId OR roleName)
    let roleDoc = null;
    if (roleId && isObjectId(roleId)) {
      roleDoc = await Role.findById(roleId);
    } else if (roleName) {
      roleDoc = await Role.findOne({ name: roleName });
    }
    if (!roleDoc)
      return res
        .status(400)
        .json({ message: "Valid roleId or roleName required" });

    const payload = {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      roleId: roleDoc._id,
      roleName: roleDoc.name,
      status: status === "inactive" ? "inactive" : "active",
    };

    const exists = await User.exists({ email: payload.email });
    if (exists)
      return res.status(409).json({ message: "Email already exists" });

    const created = await User.create(payload);
    res.status(201).json(sanitize(created));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const body = req.body || {};
    // console.log("Update request body:", body);

    const patch = {};

    // Common fields
    if (body.name) patch.name = String(body.name).trim();
    if (body.email) patch.email = String(body.email).trim().toLowerCase();
    if (body.profileImg != null) patch.profileImg = body.profileImg;
    if (body.backgroundImg != null) patch.backgroundImg = body.backgroundImg;
    if (body.bio != null) patch.bio = String(body.bio).trim();
    if (body.location != null) patch.location = String(body.location).trim();
    if (Array.isArray(body.social)) patch.social = body.social;

    // Role update
    if (body.roleId || body.roleName) {
      let roleDoc = null;
      if (body.roleId && isObjectId(body.roleId)) {
        roleDoc = await Role.findById(body.roleId);
      } else if (body.roleName) {
        roleDoc = await Role.findOne({ name: body.roleName });
      }
      if (!roleDoc) {
        return res.status(400).json({ message: "Invalid role" });
      }
      patch.roleId = roleDoc._id;
      patch.roleName = roleDoc.name;
    }

    // Status update
    if (body.status) {
      patch.status = body.status === "inactive" ? "inactive" : "active";
    }

    // Ensure unique email
    if (patch.email) {
      const dup = await User.exists({ _id: { $ne: id }, email: patch.email });
      if (dup) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    // console.log("Final patch:", patch);

    const updated = await User.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(sanitize(updated));
  } catch (err) {
    console.error("Update user error:", err);
    res.status(400).json({ message: err.message || "Failed to update user" });
  }
};

// DELETE /api/users/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    // "own" scope → can only delete self
    if (req.authz?.decision === "own" && String(id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden (own scope)" });
    }

    const removed = await User.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
