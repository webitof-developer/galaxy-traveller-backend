// generate-client-token.js
// Usage: JWT_SECRET=yoursecret node generate-client-token.js
// Or: create a .env and uncomment dotenv line below.

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("ERROR: JWT_SECRET environment variable not set.");
  process.exit(1);
}

// ⚠️ make sure you set MONGO_URI in env
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("ERROR: MONGO_URI environment variable not set.");
  process.exit(1);
}

async function main() {
  try {
    await mongoose.connect(MONGO_URI);

    // 🔹 You can pass a role as argument: e.g. `node generate-client-token.js creator`
    const roleArg = process.argv[2] || "client";
    const user = await User.findOne({ roleName: roleArg }).lean();

    if (!user) {
      console.error(`❌ No user found with roleName: ${roleArg}`);
      process.exit(1);
    }

    console.log("=== ✅ USER FOUND ===");
    console.log(JSON.stringify(user, null, 2));

    const payload = {
      id: user._id.toString(),
      role: user.roleName,
      email: user.email,
      name: user.name,
    };

    const signOptions = {
      algorithm: "HS256",
      expiresIn: "200y", // for dev/testing; reduce in production
    };

    // 🔹 Generate token
    const token = jwt.sign(payload, secret, signOptions);

    console.log("\n=== 🪪 JWT GENERATED ===");
    console.log(token);

    // 🔹 Decode without verifying (just to show payload)
    const decoded = jwt.decode(token);
    console.log("\n=== 🔍 DECODED PAYLOAD (unverified) ===");
    console.log(JSON.stringify(decoded, null, 2));

    // 🔹 Verify to confirm it’s valid with secret
    const verified = jwt.verify(token, secret);
    console.log("\n=== ✅ VERIFIED PAYLOAD (using JWT_SECRET) ===");
    console.log(JSON.stringify(verified, null, 2));

    console.log("\n--- ℹ️ Info ---");
    console.log(
      "User:",
      JSON.stringify({ id: user._id, email: user.email, role: user.roleName })
    );
    console.log("expiresIn:", signOptions.expiresIn);

    console.log("\n--- 🧠 Example usage (server-side) ---");
    console.log(
      `curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/creatorHome`
    );

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Failed to generate token:", err);
    process.exit(2);
  }
}

main();
