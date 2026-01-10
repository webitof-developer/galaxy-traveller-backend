const { DEFAULTS, buildMiddleware } = require("../lib/rate-limit/rateLimiter");

const publicLimiter = buildMiddleware({
  prefix: "public",
  windowSeconds: DEFAULTS.public.windowSeconds,
  max: DEFAULTS.public.max,
  message: "Too many requests. Please slow down.",
  keyGenerator: (req) => req.ip,
});

function shouldBypass(req) {
  // Only rate-limit cacheable reads; never block moderation/admin paths.
  if (!["GET", "HEAD"].includes(req.method)) return true;
  if (req.path && req.path.toLowerCase().includes("moderation")) return true;
  if (req.user && ["admin", "superadmin", "staff"].includes(req.user.roleName))
    return true;
  return false;
}

module.exports = function rateLimitPublic(req, res, next) {
  if (shouldBypass(req)) return next();
  return publicLimiter(req, res, next);
};
