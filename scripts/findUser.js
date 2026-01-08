// scripts/testUserFind.js
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User"); // adjust path if needed

const MONGO_URI = process.env.MONGO_URI;

const userId = "689598be9c60f2b5d1691e37"; // replace with actual ObjectId from Compass

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const user = await User.findById(userId).select("-password");
    if (!user) {
      console.log("❌ User not found");
    } else {
      console.log("✅ User found:");
      console.log(user);
    }
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    mongoose.disconnect();
  }
};

run();
