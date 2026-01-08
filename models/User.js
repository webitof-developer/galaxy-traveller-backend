// src/models/User.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },

    profileImg: {
      type: String,
      default: "",
    },
    backgroundImg: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    authProvider: {
      type: String,
      enum: ["google", "email"],
      required: true,
      default: "email",
    },
    social: [
      {
        platform: {
          type: String,
          enum: ["youtube", "instagram", "facebook", "website"],
        },
        url: { type: String, trim: true },
      },
    ],

    // Add Google ID
    googleId: { type: String, unique: true, sparse: true }, // sparse allows multiple users without googleId
    // Dynamic role: reference the Role document
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },

    // Optional mirror for convenience (not used for decisions):
    roleName: { type: String, trim: true, index: true }, // keep in sync from Role on write

    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("name")) return next();

  const baseSlug = this.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let slug = baseSlug;
  let counter = 1;

  // Ensure uniqueness
  while (await mongoose.models.User.findOne({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  this.slug = slug;
  next();
});

// (optional) helper to keep roleName in sync if you set roleId and provide roleName later
UserSchema.methods.setRole = function (roleDoc) {
  this.roleId = roleDoc._id;
  this.roleName = roleDoc.name;
};

module.exports = mongoose.model("User", UserSchema);
