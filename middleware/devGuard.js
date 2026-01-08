// middleware/devGuard.js
module.exports = function devGuard(req, res, next) {
  if (process.env.ALLOW_MODEL_EDIT !== "true")
    return res.status(403).json({ message: "Model editing disabled" });
  const user = req.user || {};
  if (user.role !== "admin")
    return res.status(403).json({ message: "Admins only" });
  next();
};
