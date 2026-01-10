const { DEFAULTS, buildMiddleware } = require("../lib/rate-limit/rateLimiter");

const authLimiter = buildMiddleware({
  prefix: "auth",
  windowSeconds: DEFAULTS.auth.windowSeconds,
  max: DEFAULTS.auth.max,
  message: "Too many login attempts. Please wait and try again.",
  keyGenerator: (req) => req.ip,
});

function shouldBypass(req) {
  // Allow internal/admin traffic to flow freely.
  if (req.user && ["admin", "superadmin", "staff"].includes(req.user.roleName))
    return true;
  return false;
}

module.exports = function rateLimitAuth(req, res, next) {
  if (shouldBypass(req)) return next();
  return authLimiter(req, res, next);
};
