// controllers/roles.controller.js
const mongoose = require("mongoose");
const Role = require("../models/Role");

// Try to resolve User model if it exists (optional for userCount)
let User = null;
try {
  User = mongoose.model("User");
} catch (_) {
  /* no User model registered */
}

// Small async wrapper
const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Count users that have this role (supports a few common shapes)
async function countUsersForRole(role) {
  if (!User) return 0;
  return User.countDocuments({
    $or: [
      { role: role._id }, // ObjectId in `role`
      { roleId: role._id }, // ObjectId in `roleId`
      { role: role.name }, // string name in `role`
      { roleName: role.name }, // string name in `roleName`
    ],
  });
}

exports.list = ah(async (req, res) => {
  const withCounts = String(req.query.withCounts || "") === "1";
  const roles = await Role.find().sort({ name: 1 }).lean();

  if (!withCounts) return res.json(roles);

  const out = await Promise.all(
    roles.map(async (r) => ({ ...r, userCount: await countUsersForRole(r) }))
  );
  res.json(out);
});

exports.getOne = ah(async (req, res) => {
  const role = await Role.findById(req.params.id).lean();
  if (!role) return res.status(404).json({ message: "Role not found" });
  res.json(role);
});

exports.create = ah(async (req, res) => {
  const {
    name,
    description,
    permissions = {},
    isSystem = false,
  } = req.body || {};
  if (!name || !name.trim())
    return res.status(400).json({ message: "Name is required" });

  const exists = await Role.findOne({ name: name.trim() });
  if (exists)
    return res.status(409).json({ message: "Role name already exists" });

  const role = await Role.create({
    name: name.trim(),
    description: description || "",
    permissions,
    isSystem: !!isSystem,
  });

  res.status(201).json(role);
});

exports.update = ah(async (req, res) => {
  // console.log(req.body);
  const { name, description, permissions, isSystem } = req.body || {};

  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ message: "Role not found" });

  if (role.isSystem && name && name.trim() !== role.name) {
    return res.status(400).json({ message: "Cannot rename a system role" });
  }

  if (name && name.trim() !== role.name) {
    const dup = await Role.findOne({
      name: name.trim(),
      _id: { $ne: role._id },
    });
    if (dup)
      return res.status(409).json({ message: "Role name already exists" });
    role.name = name.trim();
  }

  if (typeof description !== "undefined") role.description = description || "";
  if (typeof permissions !== "undefined") role.permissions = permissions || {};
  if (typeof isSystem !== "undefined") role.isSystem = !!isSystem;

  await role.save();
  res.json(role);
});

exports.remove = ah(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ message: "Role not found" });
  if (role.isSystem)
    return res.status(400).json({ message: "Cannot delete a system role" });

  // Optional: block delete if users still have this role
  // const count = await countUsersForRole(role);
  // if (count > 0) return res.status(400).json({ message: "Role in use by users" });

  await role.deleteOne();
  res.json({ message: "Deleted" });
});

exports.duplicate = ah(async (req, res) => {
  const src = await Role.findById(req.params.id).lean();
  if (!src) return res.status(404).json({ message: "Role not found" });

  const base = `${src.name} (Copy)`;
  let candidate = base;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Role.exists({ name: candidate })) {
    candidate = `${base} ${i++}`;
  }

  const dup = await Role.create({
    name: candidate,
    description: src.description || "",
    permissions: src.permissions || {},
    isSystem: false,
  });

  res.status(201).json(dup);
});
