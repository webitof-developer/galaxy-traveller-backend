// scripts/generateGraphReverseSync.js
const mongoose = require("mongoose");
const Relation = require("../models/Relation");

const models = {
  blog: require("../models/Blog"),
  destination: require("../models/Destination"),
  tour: require("../models/Tour"),
  month: require("../models/Month"),
  category: require("../models/Category"),
};

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/traveltailor";

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
  console.log("🔥 Connected to MongoDB");
}

async function main() {
  await connectDB();
  console.log("🔄 Syncing Graph → Legacy …");

  const relations = await Relation.find({}).lean();
  const grouped = {};

  for (const rel of relations) {
    const { from, to } = rel;

    if (!grouped[from.type]) grouped[from.type] = {};
    if (!grouped[from.type][from.id]) grouped[from.type][from.id] = [];

    grouped[from.type][from.id].push(to);
  }

  for (const [type, docs] of Object.entries(grouped)) {
    const Model = models[type];
    if (!Model) continue;

    for (const [id, links] of Object.entries(docs)) {
      const update = {};

      for (const link of links) {
        const base = link.type + "s";
        const field =
          type === "month"
            ? "tag" +
              link.type.charAt(0).toUpperCase() +
              link.type.slice(1) +
              "s"
            : base;

        update[field] ||= [];
        update[field].push(link.id);
      }

      for (const k of Object.keys(update)) {
        update[k] = [...new Set(update[k])];
      }

      await Model.findByIdAndUpdate(id, { $set: update });
    }
  }

  console.log("✅ Graph → Legacy sync complete");
  await mongoose.connection.close();
  console.log("🔌 DB closed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
