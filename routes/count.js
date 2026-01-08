const express = require("express");
const router = express.Router();
const { csvObjectIds, applyDateRange, buildSearch } = require("../utils/query");

// Correct relative path
router.get("/:model", async (req, res) => {
  try {
    let modelName = req.params.model;
    modelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    const Model = require(`../models/${modelName}`);
    const filter = {};

    // Optional filters
    const ids = csvObjectIds(req.query.ids);
    if (ids) filter._id = { $in: ids };

    // Apply date range filter if provided
    applyDateRange(filter, req, "createdAt");

    // Apply the search filter
    const search = buildSearch(req.query.q, [
      "title",
      "name",
      "slug",
      "description",
    ]);
    if (search) Object.assign(filter, search);

    // If the user is a creator, we filter by 'createdBy'
    if (req.query.createdBy) {
      filter.createdBy = req.query.createdBy; // Match creator ID from the request
    }

    // Apply 'tourCreatedBy' filter if provided (for enquiries)
    if (req.query.tourCreatedBy) {
      filter.tourCreatedBy = req.query.tourCreatedBy; // Match creator ID for tours
    }

    // Apply 'status' filter if provided
    if (req.query.status) {
      filter.status = req.query.status; // Only fetch items with the provided status
    }

    const count = await Model.countDocuments(filter);
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch count" });
  }
});

module.exports = router;
