// scripts/migrate.js
const { execSync } = require("child_process");

function run(cmd) {
  console.log("👉 Running:", cmd);
  execSync(cmd, { stdio: "inherit" });
}

console.log("🚀 Starting full graph migration…");

run("node scripts/generateLegacyToGraphSync.js");
run("node scripts/generateGraphReverseSync.js");
run("node scripts/validateGraphConsistency.js");

console.log("🎉 Migration complete");
