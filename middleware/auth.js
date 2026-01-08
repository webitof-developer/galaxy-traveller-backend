const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function auth(req, res, next) {
  try {
    const m = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    // console.log("token", m);
    if (!m) return res.status(401).json({ message: "No token" });

    const rawToken = m[1].trim();
    if (!process.env.JWT_SECRET)
      return res.status(500).json({ message: "JWT secret not configured" });

    const payload = jwt.verify(rawToken, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // console.log("auth", payload);

    const user = await User.findById(payload.id).lean();

    // console.log("user", user);

    if (!user) return res.status(401).json({ message: "User not found" });
    // auth.js (after fetching user by id from DB)
    if (user.roleId && !user.roleName) {
      const roleDoc = await Role.findById(user.roleId).lean();
      if (roleDoc?.name) user.roleName = roleDoc.name;
    }
    req.user = user;
    next();
  } catch (e) {
    if (e.name === "TokenExpiredError")
      return res.status(401).json({ message: "Token expired" });
    if (e.name === "JsonWebTokenError")
      return res.status(401).json({ message: "Invalid token signature" });
    return res.status(401).json({ message: "Invalid token" });
  }
};
