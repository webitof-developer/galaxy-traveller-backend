// routes/ui.js
const express = require("express");
const UiSchema = require("../data/uischema");

const router = express.Router();

/* ------------------------------- helpers ------------------------------- */

function normalizeType(t) {
  if (!t) return "text";
  const lower = String(t).toLowerCase();
  if (lower === "objectid") return "relation";
  if (lower === "objectid[]") return "relation[]";
  return lower;
}

// Sort helper: position asc, then label/key
function sortByPositionThenLabel(arr) {
  return arr.sort((a, b) => {
    const pa = a.position != null ? a.position : 9999;
    const pb = b.position != null ? b.position : 9999;
    if (pa !== pb) return pa - pb;
    return String(a.label || a.key).localeCompare(String(b.label || b.key));
  });
}

/**
 * Normalize any "fields" container into an ARRAY of defs.
 * - If it's already an array, lightly normalize & recurse nested "fields".
 * - If it's an object map, convert to array (respect .position), then recurse.
 * Preserves nested fields for both "object" and "object[]" types.
 */
function fieldsToArray(fields, parentKey = "") {
  if (!fields) return [];
  if (Array.isArray(fields)) {
    return sortByPositionThenLabel(
      fields.map((def) => ({
        ...def,
        key:
          def.key ||
          (parentKey
            ? `${parentKey}.${def.label || "field"}`
            : def.label || "field"),
        type: normalizeType(def.type),
        fields:
          (def.type === "object" || def.type === "object[]") && def.fields
            ? fieldsToArray(def.fields, def.key)
            : undefined,
      }))
    );
  }

  // Object map { fieldKey: def, ... } (this is how root `doc.fields` is stored)
  const entries = Object.entries(fields);
  entries.sort((a, b) => {
    const pa = a[1] && a[1].position != null ? a[1].position : 9999;
    const pb = b[1] && b[1].position != null ? b[1].position : 9999;
    if (pa !== pb) return pa - pb;
    return a[0].localeCompare(b[0]);
  });

  const out = entries.map(([key, def]) => {
    const type = normalizeType(def.type);
    const fullKey = parentKey ? `${parentKey}.${key}` : key;

    const base = {
      key: fullKey,
      label: def.label || key,
      type,
      width: def.width || "100%",
      required: !!def.required,
      position: def.position != null ? def.position : 9999,
      ref: def.ref,
      enumValues: def.enumValues,
      minLength: def.minLength,
      maxLength: def.maxLength,
    };

    if ((type === "object" || type === "object[]") && def.fields) {
      base.fields = fieldsToArray(def.fields, fullKey);
    }

    return base;
  });

  return out;
}

/**
 * Update position for a given dotted key (root or nested).
 * - Root fields live in doc.fields (object map) keyed by sanitized key (dots replaced in seeder by `_`).
 * - Nested `object/object[]` children live as arrays at `parent.fields` and store `key` as dotted.
 */
function setPosition(doc, dottedKey, pos) {
  if (!doc || !doc.fields) return false;

  const parts = String(dottedKey).split(".");
  // Root field (no dot)
  if (parts.length === 1) {
    const rootKey = parts[0].replace(/\./g, "_"); // seeder used underscores for stored path keys
    const rootDef = doc.fields[rootKey];
    if (!rootDef) return false;
    rootDef.position = Number(pos);
    return true;
  }

  // Nested field: find parent then target by `key` match
  const parentKey = parts[0].replace(/\./g, "_");
  const parent = doc.fields[parentKey];
  if (!parent || !Array.isArray(parent.fields)) return false;

  const target = parent.fields.find((f) => f.key === dottedKey);
  if (!target) return false;

  target.position = Number(pos);
  return true;
}

/* -------------------------------- routes -------------------------------- */

// GET normalized UiSchema for a modelKey
router.get("/:modelKey", async (req, res) => {
  try {
    const modelKey = req.params.modelKey;
    // console.log("GET UiSchema:", modelKey);
    const doc = UiSchema.find((u) => u.modelKey === modelKey);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "UiSchema not found" });
    }

    const schemaArray = fieldsToArray(doc.fields);
    return res.json({
      success: true,
      key: modelKey,
      meta: { title: modelKey },
      schema: schemaArray,
    });
  } catch (err) {
    console.error("UiSchema GET error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load UiSchema" });
  }
});

/**
 * PATCH /:modelKey/positions
 * Body supports either:
 *  - { order: ['title','slug','hero', ...] }  // sequential positions by index
 *  - { positions: { 'title':0, 'hero.title':1, ... } } // explicit map
 * Can include both; both will be applied (positions overrides order where both specify).
 * Returns updated, normalized schema.
 */
router.patch("/:modelKey/positions", async (req, res) => {
  try {
    const modelKey = req.params.modelKey;
    const { order, positions } = req.body || {};

    const doc = await UiSchema.findOne({ modelKey });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "UiSchema not found" });
    }

    // Apply "order" first (root and/or dotted keys)
    if (Array.isArray(order)) {
      order.forEach((key, idx) => setPosition(doc, key, idx));
    }

    // Apply explicit "positions" overrides
    if (positions && typeof positions === "object") {
      for (const [key, pos] of Object.entries(positions)) {
        setPosition(doc, key, pos);
      }
    }

    await doc.save();

    const schemaArray = fieldsToArray(doc.fields);
    return res.json({
      success: true,
      key: modelKey,
      meta: { title: modelKey },
      schema: schemaArray,
    });
  } catch (err) {
    console.error("UiSchema PATCH positions error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update positions" });
  }
});

module.exports = router;
