// scripts/generateLegacyToGraphSync.js
const mongoose = require("mongoose");
const Relation = require("../models/Relation");

const models = {
  blog: require("../models/Blog"),
  destination: require("../models/Destination"),
  tour: require("../models/Tour"),
  month: require("../models/Month"),
  category: require("../models/Category"),
};

const relationMap = {
  blog: [
    "blogs",
    "destinations",
    "tours",
    "tagMonths",
    "categories",
  ],
  destination: ["blogs", "tours", "tagMonths"],
  tour: ["blogs", "destinations", "tagMonths"],
  month: ["tagBlogs", "tagDestinations", "tagTours"],
  category: ["blogs"],
};

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/traveltailor";
if (!MONGO_URI) {
  console.error(
    "❌ MONGO_URI is not set. Export it before running this script."
  );
  process.exit(1);
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  console.log("🔌 Connecting to:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log("🔥 Connected to MongoDB");
}

async function main() {
  await connectDB();

  const relBefore = await Relation.countDocuments();
  console.log(`📊 Relations before: ${relBefore}`);

  let created = 0;

  for (const [type, Model] of Object.entries(models)) {
    const docs = await Model.find({}).lean();
    console.log(`📁 ${type}: ${docs.length} docs`);

    const fields = relationMap[type] || [];
    if (!fields.length) {
      console.log(`   (no relation fields configured for ${type})`);
      continue;
    }

    for (const doc of docs) {
      for (const field of fields) {
        const refs = doc[field];
        if (!Array.isArray(refs) || refs.length === 0) continue;

        for (const refId of refs) {
          // infer "to" type from field name
          const base = field.replace(/^tag/, ""); // tagBlogs -> Blogs
          const toType = base.toLowerCase().replace(/s$/, ""); // blogs -> blog

          const kind = `${type}_${toType}`;

          const res = await Relation.updateOne(
            {
              kind,
              "from.type": type,
              "from.id": doc._id,
              "to.type": toType,
              "to.id": refId,
            },
            {
              $setOnInsert: {
                kind,
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );

          if (res.upsertedCount > 0) created++;
        }
      }
    }
  }

  const relAfter = await Relation.countDocuments();
  console.log(`📊 Relations after: ${relAfter} (created this run: ${created})`);

  await mongoose.connection.close();
  console.log("🔌 Mongo connection closed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
