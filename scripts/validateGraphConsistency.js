// scripts/validateGraphConsistency.js
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
  process.env.MONGO_URI || "mongodb://localhost:27017/galaxytravel";

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
  console.log("🔥 Connected to MongoDB");
}

async function main() {
  await connectDB();
  console.log("🔍 Validating graph relations…");

  const rels = await Relation.find({}).lean();
  let errors = 0;

  for (const rel of rels) {
    const { from, to } = rel;

    const fromModel = models[from.type];
    const toModel = models[to.type];

    if (!fromModel || !toModel) {
      console.log("❌ Unknown model type in relation:", rel);
      errors++;
      continue;
    }

    const fromDoc = await fromModel.findById(from.id).lean();
    const toDoc = await toModel.findById(to.id).lean();

    if (!fromDoc) {
      console.log(`❌ Missing FROM document: ${from.type} ${from.id}`);
      errors++;
    }
    if (!toDoc) {
      console.log(`❌ Missing TO document: ${to.type} ${to.id}`);
      errors++;
    }
  }

  console.log(errors ? `❌ Found ${errors} issues.` : "✅ Graph is clean.");

  await mongoose.connection.close();
  console.log("🔌 Closed DB connection");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
