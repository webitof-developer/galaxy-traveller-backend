const redis = require("./redisClient");

// Allow environment-based namespace + version bumping for safe invalidation.
const PREFIX = process.env.CACHE_PREFIX || process.env.NODE_ENV || "dev";
const VERSION = process.env.CACHE_VERSION || "v1";

// Simple per-process in-flight map to collapse concurrent misses per key.
const inflight = new Map();

// Add small jitter to avoid synchronized expiry stampedes.
function withJitter(ttlSeconds) {
  const jitter = Math.floor(ttlSeconds * 0.1 * Math.random()); // up to 10%
  return Math.max(1, ttlSeconds - jitter);
}

function buildKey(key) {
  return `${PREFIX}:${VERSION}:${key}`;
}

function buildCacheControl(ttlSeconds, scope = "public") {
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  const stale = Math.max(ttl, Math.min(ttl * 2, 21600)); // cap stale-while-revalidate at 6h
  return `${scope}, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${stale}`;
}

function setCacheHeaders(res, ttlSeconds, scope = "public") {
  if (!res?.set) return;
  res.set("Cache-Control", buildCacheControl(ttlSeconds, scope));
}

async function get(key) {
  if (!redis.isEnabled()) return null;
  try {
    const client = await redis.ensureClient();
    if (!client) return null;
    const val = await client.get(buildKey(key));
    if (!val) {
      return null;
    }
    return JSON.parse(val);
  } catch (err) {
    console.error("[cache] get error", err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  if (!redis.isEnabled()) return;
  try {
    const client = await redis.ensureClient();
    if (!client) return;
    await client.set(buildKey(key), JSON.stringify(value), {
      EX: withJitter(ttlSeconds),
    });
  } catch (err) {
    console.error("[cache] set error", err.message);
  }
}

/**
 * Read-through with stampede protection.
 * - If cached -> return.
 * - If another request is already fetching this key -> await it.
 * - Else run loader, set cache, return.
 * Never throws on Redis issues; loader errors still propagate.
 */
async function getOrSet(key, ttlSeconds, loader) {
  if (!redis.isEnabled()) {
    return loader();
  }

  const cached = await get(key);
  if (cached !== null && cached !== undefined) return cached;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const p = (async () => {
    try {
      const val = await loader();
      if (val !== null && val !== undefined) {
        await set(key, val, ttlSeconds);
      }
      return val;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

async function del(key) {
  if (!redis.isEnabled()) return;
  try {
    const client = await redis.ensureClient();
    if (!client) return;
    await client.del(buildKey(key));
  } catch (err) {
    console.error("[cache] del error", err.message);
  }
}

module.exports = {
  get,
  getOrSet,
  set,
  del,
  key: buildKey, // for visibility/testing
  setCacheHeaders,
  buildCacheControl,
};
