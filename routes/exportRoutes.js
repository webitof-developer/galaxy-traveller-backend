const express = require("express");
const router = express.Router();

const ExcelJS = require("exceljs");
const { MODELS, exportModel } = require("../utils/exporter");
const { flattenDoc, collectHeaders } = require("../utils/csv"); // reuse our flattener

const auth = require("../middleware/auth");
const { ensurePermission } = require("../middleware/ensurePermission");

function buildHeaderOrder(rows, explicitFields) {
  if (explicitFields?.length) return explicitFields;
  const union = collectHeaders(rows);
  const preferred = [
    "id",
    "status",
    "createdAt",
    "updatedAt",
    "slug",
    "title",
    "name",
  ];
  const rest = union.filter((h) => !preferred.includes(h));
  return [...preferred, ...rest];
}

async function addSheetForModel(wb, modelKey, docs, fields) {
  const rows = docs.map((d) => flattenDoc(d));
  const headers = buildHeaderOrder(rows, fields);

  const ws = wb.addWorksheet(modelKey);
  ws.columns = headers.map((h) => ({ header: h, key: h }));

  // add rows
  for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? ""));

  // simple auto-fit
  ws.columns.forEach((col) => {
    let max = col.header ? String(col.header).length : 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 2, 10), 60);
  });
}

router.get("/all.xlsx", auth, async (req, res, next) => {
  try {
    const {
      status,
      from,
      to,
      ids,
      select,
      sort,
      limit,
      hydrate,
      lean,
      only,
      exclude,
      fields,
    } = req.query;

    const onlyKeys = only
      ? String(only)
          .split(",")
          .map((s) => s.trim())
      : null;
    const excludeKeys = exclude
      ? String(exclude)
          .split(",")
          .map((s) => s.trim())
      : [];

    const keys = Object.keys(MODELS) // ['blog',   ...]
      .filter((k) => (onlyKeys ? onlyKeys.includes(k) : true))
      .filter((k) => !excludeKeys.includes(k));

    const wb = new ExcelJS.Workbook();
    wb.creator = "API Export";
    wb.created = new Date();

    for (const key of keys) {
      try {
        const docs = await exportModel(key, {
          status,
          from,
          to,
          ids: ids ? ids.split(",").map((s) => s.trim()) : undefined,
          select,
          sort: sort || "-createdAt,-_id",
          limit: limit ? Number(limit) : undefined,
          hydrate: hydrate !== "false",
          lean: lean === "true" ? true : false,
        });

        await addSheetForModel(
          wb,
          key,
          docs,
          fields ? fields.split(",").map((s) => s.trim()) : undefined
        );
      } catch (err) {
        console.error(`Export failed for model ${key}`, err);
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="export.xlsx"');

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});

router.get("/:modelKey.xlsx", auth, async (req, res, next) => {
  try {
    const { modelKey } = req.params;
    const {
      status,
      from,
      to,
      ids,
      select,
      sort,
      limit,
      hydrate,
      lean,
      fields,
    } = req.query;

    const docs = await exportModel(modelKey, {
      status,
      from,
      to,
      ids: ids
        ? String(ids)
            .split(",")
            .map((s) => s.trim())
        : undefined,
      select,
      sort: sort || "-createdAt,-_id",
      limit: limit ? Number(limit) : undefined,
      hydrate: hydrate !== "false",
      lean: lean === "true" ? true : false,
    });

    const wb = new ExcelJS.Workbook();
    await addSheetForModel(
      wb,
      String(modelKey).toLowerCase(),
      docs,
      fields ? fields.split(",").map((s) => s.trim()) : undefined
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${modelKey}.xlsx"`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});

router.get("/count/:model", auth, async (req, res) => {
  const modelName = req.params.model;
  const { status, from, to, ids } = req.query;

  try {
    const Model = require(`./models/${modelName}`);

    const filter = {};

    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (ids) filter._id = { $in: ids.split(",").map((i) => i.trim()) };

    const count = await Model.countDocuments(filter);
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ count: 0 });
  }
});

router.get("/data/:model", auth, async (req, res) => {
  const modelName = req.params.model;
  const skip = parseInt(req.query.skip) || 0;
  const limit = parseInt(req.query.limit) || 100;

  // Build filter from query
  const { status, from, to, ids } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (ids) filter._id = { $in: ids.split(",").map((i) => i.trim()) };

  try {
    const Model = require(`./models/${modelName}`);
    const data = await Model.find(filter).skip(skip).limit(limit).lean(); // optional: faster if you don't need full mongoose docs
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

module.exports = router;
