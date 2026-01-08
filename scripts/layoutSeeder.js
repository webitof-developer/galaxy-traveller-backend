// scripts/layoutSeeder.js
const mongoose = require("mongoose");
const { models } = require("../models");
const UiSchema = require("../models/UiSchema");

const fs = require("fs");
const path = require("path");

// Helper function to generate the JavaScript file
function generateJsFile(data) {
  const filePath = path.join(__dirname, "../data/uischema.js");

  const fileContent = `
    const uiSchemas = ${JSON.stringify(data, null, 2)};
    export default uiSchemas;
  `;

  fs.writeFileSync(filePath, fileContent);
  console.log("JavaScript file generated successfully: uischema.js");
}

const {
  SEOSchema,
  HeroSchema,
  HighlightSchema,
  PlanSchema,
  DestinationGroupSchema,
  HeroSlideSchema,
  MomentSchema,
  TestimonialSchema,
  ReviewSchema,
  TourGroupSchema,
} = require("../models/Shared");

const SharedSchemas = {
  seo: SEOSchema,
  hero: HeroSchema,
  highlight: HighlightSchema,
  plan: PlanSchema,
  destinationGroup: DestinationGroupSchema,
  heroSlide: HeroSlideSchema,
  moment: MomentSchema,
  testimonial: TestimonialSchema,
  review: ReviewSchema,
  tourGroup: TourGroupSchema,
};

// Split "displayImg" => "display Img", "heroImageURL" => "hero Image URL"
function splitCamel(s = "") {
  return String(s).replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

// Name-based image detection that works for camelCase / snake / kebab / plain
function nameLooksImageish(name = "") {
  const n = splitCamel(String(name))
    .replace(/[_\-./]/g, " ")
    .toLowerCase();

  // include common image-y words; add more if you use other conventions
  return /\b(img|image|photo|pic|avatar|thumb|thumbnail|cover|banner|logo|poster|gallery)\b/.test(
    n
  );
}

function isImageHint(path, schemaTypeOrCaster) {
  if (!schemaTypeOrCaster) return false;

  const p = String(path || "");
  const opts = schemaTypeOrCaster.options || {};
  const titleish = [opts.title, opts.label, opts.description]
    .filter(Boolean)
    .map(splitCamel)
    .join(" ");

  // 1) Name/title signals (now supports camelCase & substrings)
  const nameLooksImage = nameLooksImageish(p) || nameLooksImageish(titleish);

  // 2) Regex validation signals (match or validators[].regexp)
  const regexes = [];
  if (opts.match instanceof RegExp) regexes.push(opts.match);
  if (Array.isArray(schemaTypeOrCaster.validators)) {
    for (const v of schemaTypeOrCaster.validators) {
      if (v && v.regexp instanceof RegExp) regexes.push(v.regexp);
    }
  }
  const regexHints = regexes.some((rx) => {
    const s = String(rx);
    return (
      /image\//i.test(s) ||
      /\.(png|jpe?g|webp|gif|svg|bmp|tiff)\b/i.test(s) ||
      /(https?:\/\/.*\.(?:png|jpe?g|webp|gif|svg)(\?|$))/i.test(s)
    );
  });

  // 3) Enum hints
  const enumVals = extractEnumValues(schemaTypeOrCaster);
  const enumLooksImage = Array.isArray(enumVals)
    ? enumVals.some((v) =>
        /image\/|\.png$|\.jpe?g$|\.webp$|\.gif$|\.svg$/i.test(String(v))
      )
    : false;

  return Boolean(nameLooksImage || regexHints || enumLooksImage);
}

// Helper: get shared sub-schema by the last segment of the path (e.g. "hero" from "campaign.hero")
function resolveSharedByPath(path) {
  const last = String(path).split(".").pop();
  return SharedSchemas[last];
}

// Small helpers
const isNonEmptyArray = (arr) => Array.isArray(arr) && arr.length > 0;
const toLower = (v) => String(v || "").toLowerCase();

/** Extract enum values from a mongoose schemaType (works for strings and casters) */
function extractEnumValues(schemaTypeOrCaster) {
  if (!schemaTypeOrCaster) return undefined;
  // Mongoose stores enum choices in .enumValues; sometimes also .options.enum
  const vals =
    schemaTypeOrCaster.enumValues ||
    schemaTypeOrCaster.options?.enum ||
    undefined;
  return isNonEmptyArray(vals) ? vals : undefined;
}

/** Map a mongoose path to UI type (+ nested fields when needed) */

function mapFieldToUiType(path, schemaType) {
  const inst = toLower(schemaType.instance);

  // 🔁 Arrays
  if (inst === "array") {
    const caster = schemaType.caster;
    const casterInst = toLower(caster?.instance);

    // Array of inline subdocuments (most common)
    if (caster?.schema) {
      const shared = resolveSharedByPath(path) || caster.schema;
      return {
        type: "object[]",
        fields: mapSchemaFields(shared, path), // dotted, prefixed
        width: "50%", // default to 50% for arrays
      };
    }

    // Array of relations
    if (casterInst === "objectid" && caster?.options?.ref) {
      const ref = caster.options.ref;
      // Optional: treat refs to Image-like models as images
      if (/image/i.test(String(ref))) return { type: "image[]" };
      return { type: "relation[]", ref, width: "50%" };
    }

    // Primitive array (e.g., string[] / number[] / boolean[] / date[])
    if (casterInst) {
      // ✅ Image array detection for string[]
      if (casterInst === "string") {
        const enumValues = extractEnumValues(caster);

        // If any explicit image signal → image[]
        if (isImageHint(path, caster)) {
          return { type: "image[]" };
        }

        // If enum on strings → enumDropdown[]
        if (enumValues) {
          return { type: "enumDropdown[]", enumValues };
        }

        // Fallback to text[]
        return { type: "text[]", width: "50%" };
      }

      // number[] / boolean[] / date[] etc
      return { type: `${casterInst}[]`, width: "50%" };
    }

    return { type: "array", width: "50%" };
  }

  // 🧩 Embedded objects / subdocuments
  if (schemaType.schema) {
    const shared = resolveSharedByPath(path) || schemaType.schema;
    return {
      type: "object",
      fields: mapSchemaFields(shared, path), // dotted, prefixed
      width: "100%", // set width to 100% for objects (object & richtext)
    };
  }

  // 🔗 Single relation
  if (inst === "objectid" && schemaType.options?.ref) {
    const ref = schemaType.options.ref;
    // Optional: treat refs to Image-like models as images
    if (/image/i.test(String(ref))) return { type: "image", width: "50%" };
    return { type: "relation", ref, width: "50%" };
  }

  // 🗺️ Map → treat as object (unknown shape)
  if (inst === "map") return { type: "object", fields: [], width: "100%" };

  // 🔤 Primitives
  switch (inst) {
    case "string": {
      const minLength = schemaType.options?.minlength;
      const maxLength = schemaType.options?.maxlength;
      const enumValues = extractEnumValues(schemaType);

      // ✅ Image detection for string (name/title/validators/enum)
      if (isImageHint(path, schemaType)) {
        return { type: "image", minLength, maxLength, width: "50%" };
      }

      // ENUM → enumDropdown
      if (enumValues) {
        return {
          type: "enumDropdown",
          enumValues,
          minLength,
          maxLength,
          width: "50%",
        };
      }

      // "richtext" rule: very long strings
      if (typeof maxLength === "number" && maxLength > 5000) {
        return { type: "richtext", minLength, maxLength, width: "100%" }; // full-width for richtext
      }

      // (Keep your original fallback too—harmless redundancy)
      if (/img$|image|photo|pic|avatar/i.test(String(path))) {
        return { type: "image", minLength, maxLength, width: "50%" };
      }

      // Long text hint → textarea
      if ((minLength ?? 0) >= 100 || (maxLength ?? 0) > 200) {
        return { type: "textarea", minLength, maxLength, width: "50%" };
      }

      return { type: "text", minLength, maxLength, width: "50%" }; // default to 50% width for text
    }

    case "number":
      return { type: "number", width: "50%" };

    case "date":
      return { type: "date", width: "50%" };

    case "boolean":
      return { type: "switch", width: "50%" };

    case "mixed":
    default:
      return { type: "text", width: "50%" }; // default width
  }
}

/**
 * Build an ARRAY of field defs (with dotted keys) for a sub-schema.
 * Example for `seo`:
 * [
 *   { key:'seo.metaTitle', type:'text', ... },
 *   { key:'seo.metaDescription', ... },
 * ]
 */
function mapSchemaFields(schema, basePath = "") {
  const fields = [];

  Object.keys(schema.paths).forEach((subPath) => {
    if (
      subPath.startsWith("_") ||
      ["__v", "createdAt", "updatedAt"].includes(subPath)
    )
      return;

    const subField = schema.paths[subPath];
    const fullKey = basePath ? `${basePath}.${subPath}` : subPath;
    const ui = mapFieldToUiType(fullKey, subField);

    fields.push({
      key: fullKey,
      label: subPath.split(".").pop(),
      type: ui.type,
      ref: ui.ref,
      fields:
        ui.type === "object" || ui.type === "object[]"
          ? ui.fields || []
          : undefined,
      width: ui.width, // dynamic width
      required: !!subField.isRequired,
      enumValues:
        ui.enumValues ||
        (subField.enumValues?.length ? subField.enumValues : undefined),
      minLength: ui.minLength,
      maxLength: ui.maxLength,
    });
  });

  return fields;
}

async function seedUiSchemas() {
  const schemas = [];
  for (const [key, def] of Object.entries(models)) {
    const schemaPaths = def.model.schema.paths;
    const fields = {};
    let pos = 0;

    Object.keys(schemaPaths).forEach((path) => {
      if (
        path.startsWith("_") ||
        path.includes(".$*") ||
        ["__v", "createdAt", "updatedAt", "extras"].includes(path)
      )
        return;

      // Skip nested/dotted subpaths; parent object/array will carry its children
      if (path.includes(".")) return;

      const p = schemaPaths[path];
      const ui = mapFieldToUiType(path, p);

      fields[path.replace(/\./g, "_")] = {
        type: ui.type,
        ref: ui.ref,
        fields:
          ui.type === "object" || ui.type === "object[]"
            ? ui.fields || []
            : undefined,
        width: ui.width, // dynamic width
        position: pos++,
        required: !!p.isRequired,
        enumValues:
          ui.enumValues || (p.enumValues?.length ? p.enumValues : undefined),
        minLength: ui.minLength ?? p?.options?.minlength,
        maxLength: ui.maxLength ?? p?.options?.maxlength,
      };
    });

    // Ensure EXTRAS is always a plain object node
    fields.extras = {
      type: "object",
      fields: Array.isArray(fields.extras?.fields) ? fields.extras.fields : [],
      width: "100%",
      position: pos++,
      required: false,
    };

    schemas.push({ modelKey: key, fields });
    // Upsert (create if missing; update if exists)
    await UiSchema.findOneAndUpdate(
      { modelKey: key },
      { modelKey: key, fields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✨ UiSchema upserted for ${key}`);
  }

  console.log("🎉 UiSchema seeding completed!");

  // Generate the local JS file after seeding
  generateJsFile(schemas);
  process.exit(0);
}

mongoose
  .connect("mongodb://localhost:27017/travel-tailor")
  .then(() => seedUiSchemas())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

module.exports = seedUiSchemas;
