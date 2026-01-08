const BecomeCreator = require("../models/BecomeCreator");
const User = require("../models/User");
const Role = require("../models/Role"); // must exist with a "creator" entry
const { notifyUser } = require("../utils/notifyUser");

exports.apply = async (req, res) => {
  try {
    const userId = req.user._id; // from auth middleware
    const { name, documentPath, documentLink } = req.body || {};
    if (!name || (!documentPath && !documentLink)) {
      return res
        .status(400)
        .json({ error: "name and documentPath/documentLink are required" });
    }

    // Prevent multiple pending applications
    const existingPending = await BecomeCreator.findOne({
      userId,
      status: "pending",
    });
    if (existingPending) {
      return res
        .status(409)
        .json({ error: "You already have a pending request" });
    }
    // if documentPath present, store that string in documentLink for now (it may be a path, not a URL)
    const payload = {
      userId: req.user._id,
      name,
      documentLink: documentPath || documentLink, // can be a path or URL
      status: "pending",
    };
    const item = await BecomeCreator.create(payload);

    res.status(201).json(item);
  } catch (e) {
    console.error("[BecomeCreator.apply] error:", e);
    res.status(500).json({ error: "Failed to submit request" });
  }
};

exports.getMine = async (req, res) => {
  try {
    const userId = req.user._id;
    const items = await BecomeCreator.find({ userId }).sort({ createdAt: -1 });
    res.json({ items });
  } catch (e) {
    console.error("[BecomeCreator.getMine] error:", e);
    res.status(500).json({ error: "Failed to fetch your requests" });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await BecomeCreator.findById(req.params.id).populate(
      "userId",
      "name email roleId roleName"
    );
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    console.error("[BecomeCreator.getById] error:", e);
    res.status(500).json({ error: "Failed to fetch request" });
  }
};

exports.list = async (req, res) => {
  try {
    // optional filters: status, q (by name/email)
    const { status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    if (q) {
      // join via user? keep it simple: fetch ids by user email if needed
      // or just name matches on request:
      filter.$or = [{ name: new RegExp(q, "i") }];
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [items, total] = await Promise.all([
      BecomeCreator.find(filter)
        .populate("userId", "name email roleId roleName")
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l),
      BecomeCreator.countDocuments(filter),
    ]);

    res.json({ items, total, page: p, limit: l });
  } catch (e) {
    console.error("[BecomeCreator.list] error:", e);
    res.status(500).json({ error: "Failed to list requests" });
  }
};

exports.accept = async (req, res) => {
  try {
    const id = req.params.id;
    const reviewerId = req.user._id;

    const requestDoc = await BecomeCreator.findById(id).populate(
      "userId",
      "name email roleId roleName"
    );
    if (!requestDoc)
      return res.status(404).json({ error: "Request not found" });
    if (requestDoc.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Only pending requests can be approved" });
    }

    // Find the creator role
    const creatorRole = await Role.findOne({ name: "creator" }).select(
      "_id name"
    );
    if (!creatorRole) {
      return res.status(500).json({ error: "Creator role not configured" });
    }

    // Update user
    const user = await User.findById(requestDoc.userId._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.roleId = creatorRole._id;
    user.roleName = creatorRole.name;
    await user.save();

    // Update request status
    requestDoc.status = "approved";
    requestDoc.rejectReason = "";
    requestDoc.reviewedBy = reviewerId;
    await requestDoc.save();

    // Notify via email
    await notifyUser({
      type: "roleChange",
      user: {
        name: user.name,
        email: user.email,
        roleStatus: "approved",
      },
    });

    res.json({ ok: true, request: requestDoc });
  } catch (e) {
    console.error("[BecomeCreator.accept] error:", e);
    res.status(500).json({ error: "Failed to approve request" });
  }
};

exports.reject = async (req, res) => {
  try {
    const id = req.params.id;
    const reviewerId = req.user._id;
    const { rejectReason } = req.body;

    const requestDoc = await BecomeCreator.findById(id).populate(
      "userId",
      "name email"
    );
    if (!requestDoc)
      return res.status(404).json({ error: "Request not found" });
    if (requestDoc.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Only pending requests can be rejected" });
    }

    requestDoc.status = "rejected";
    requestDoc.rejectReason = rejectReason || "Not specified";
    requestDoc.reviewedBy = reviewerId;
    await requestDoc.save();

    // Notify via email
    await notifyUser({
      type: "roleChange",
      user: {
        name: requestDoc.userId?.name,
        email: requestDoc.userId?.email,
        roleStatus: "rejected",
        rejectionReason: requestDoc.rejectReason,
      },
    });

    res.json({ ok: true, request: requestDoc });
  } catch (e) {
    console.error("[BecomeCreator.reject] error:", e);
    res.status(500).json({ error: "Failed to reject request" });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await BecomeCreator.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[BecomeCreator.remove] error:", e);
    res.status(500).json({ error: "Failed to delete request" });
  }
};
