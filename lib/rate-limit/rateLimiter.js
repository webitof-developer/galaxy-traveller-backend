const redis = require("../cache/redisClient");

const toInt = (val, fallback) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DEFAULTS = {
  public: {
    windowSeconds: toInt(process.env.RATE_LIMIT_PUBLIC_WINDOW, 300), // 5m
    max: toInt(process.env.RATE_LIMIT_PUBLIC_MAX, 300),
  },
  auth: {
    windowSeconds: toInt(process.env.RATE_LIMIT_AUTH_WINDOW, 300),
    max: toInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
  },
  admin: {
    windowSeconds: toInt(process.env.RATE_LIMIT_ADMIN_WINDOW, 300),
    max: toInt(process.env.RATE_LIMIT_ADMIN_MAX, 0), // 0 disables
  },
};

const memoryStore = new Map(); // key -> { count, resetAt }

function hitMemory(key, windowMs, limit) {
  const now = Date.now();
  const existing = memoryStore.get(key);
  let resetAt = existing?.resetAt || now + windowMs;
  let count = existing?.count || 0;

  if (now >= resetAt) {
    resetAt = now + windowMs;
    count = 0;
  }

  count += 1;
  memoryStore.set(key, { count, resetAt });

  const remaining = Math.max(0, limit - count);
  const retryAfter = remaining > 0 ? 0 : Math.ceil((resetAt - now) / 1000);

  return {
    allowed: count <= limit,
    remaining,
    retryAfter,
    resetMs: resetAt,
    backend: "memory",
  };
}

async function hitRedis(key, windowMs, limit) {
  if (!redis.isEnabled()) return null;
  const client = await redis.ensureClient();
  if (!client) return null;

  const windowSeconds = Math.ceil(windowMs / 1000);
  const redisKey = `rl:${key}`;

  try {
    const results = await client
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, "NX")
      .ttl(redisKey)
      .exec();

    const count = results?.[0]?.[1] ?? 0;
    let ttlSeconds = results?.[2]?.[1] ?? windowSeconds;
    if (!ttlSeconds || ttlSeconds < 0) {
      ttlSeconds = windowSeconds;
    }

    const remaining = Math.max(0, limit - count);
    const retryAfter = remaining > 0 ? 0 : Math.ceil(ttlSeconds);

    return {
      allowed: count <= limit,
      remaining,
      retryAfter,
      resetMs: Date.now() + ttlSeconds * 1000,
      backend: "redis",
    };
  } catch (err) {
    console.error("[rate-limit] redis error", err.message);
    return null; // fall back to memory
  }
}

function createLimiter({ prefix, windowSeconds, max }) {
  const limit = toInt(max, 0);
  if (!limit || limit <= 0) return null; // disabled

  const windowMs = Math.max(1000, (windowSeconds || 60) * 1000);
  const bucketPrefix = prefix || "general";

  const check = async (identifier) => {
    const key = `${bucketPrefix}:${identifier}`;
    const redisHit = await hitRedis(key, windowMs, limit);
    if (redisHit) return { ...redisHit, limit };
    const memHit = hitMemory(key, windowMs, limit);
    return { ...memHit, limit };
  };

  return { check, limit, windowMs, bucketPrefix };
}

function buildMiddleware(config) {
  const limiter = createLimiter(config);
  if (!limiter) {
    return (_req, _res, next) => next(); // disabled/fail-open
  }

  return async function rateLimitMiddleware(req, res, next) {
    try {
      const key =
        (config.keyGenerator && config.keyGenerator(req)) ||
        req.ip ||
        req.headers["x-forwarded-for"] ||
        "unknown";

      if (!key) return next();

      const result = await limiter.check(key);
      if (!result) return next(); // fail open on errors

      res.setHeader("X-RateLimit-Limit", String(limiter.limit));
      res.setHeader(
        "X-RateLimit-Remaining",
        String(Math.max(0, result.remaining)),
      );
      if (result.resetMs) {
        res.setHeader(
          "X-RateLimit-Reset",
          String(Math.ceil(result.resetMs / 1000)),
        );
      }

      if (!result.allowed) {
        if (result.retryAfter) {
          res.setHeader("Retry-After", String(result.retryAfter));
        }

        return res.status(429).json({
          success: false,
          message:
            config.message ||
            "Too many requests. Please slow down and try again.",
        });
      }

      return next();
    } catch (err) {
      console.error("[rate-limit] middleware error", err.message);
      return next(); // fail open
    }
  };
}

module.exports = {
  DEFAULTS,
  createLimiter,
  buildMiddleware,
};
