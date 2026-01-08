const express = require("express");
const { models } = require("../models");

const router = express.Router();

// List all models
router.get("/", (req, res) => {
  const flat = Object.values(models).map((entry) => {
    const m = entry.meta || {};
    const collectionType = String(m.collectionType || "").toLowerCase();
    return {
      key: m.key,
      name: m.name || m.key,
      collectionType:
        collectionType === "singleton" ? "single" : collectionType,
      singleton: collectionType === "singleton" || collectionType === "single",
      ui: m.ui || {},
      route: m.route,
    };
  });
  // console.log(flat, "flat", models);
  res.json(flat);
});

// Get single model schema for dynamic forms
router.get("/:key", (req, res) => {
  const { key } = req.params;
  const def = models[key];
  if (!def) return res.status(404).json({ message: "Model not found" });

  const schemaPaths = def.model.schema.paths;
  const safeSchema = {};

  Object.keys(schemaPaths).forEach((path) => {
    // ❌ Skip unwanted / internal fields
    if (
      path.startsWith("_") || // _id, __v, etc
      path.includes(".$*") || // map child definitions
      path.includes("extras") || // map child definitions
      path.endsWith("$*") ||
      ["__v", "createdAt", "updatedAt"].includes(path) // common auto fields
    ) {
      return;
    }

    const p = schemaPaths[path];

    safeSchema[path] = {
      instance: p.instance, // String, Number, Date, ObjectId, etc.
      enumValues: p.enumValues?.length ? p.enumValues : undefined,
      defaultValue:
        typeof p.defaultValue === "function" ? undefined : p.defaultValue,
      required: !!p.isRequired,
    };
  });

  res.json({
    key,
    meta: def.meta,
    schema: safeSchema,
  });
});

module.exports = router;
