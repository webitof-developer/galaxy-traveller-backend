const { createClient } = require("redis");

/**
 * Lightweight Redis client wrapper that never breaks requests if Redis is down.
 * Shared across cache + rate limiter so we keep a single connection lifecycle.
 * Uses REDIS_URL or host/port/password envs. Set REDIS_ENABLED=false to disable.
 */
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";
const REDIS_URL =
  process.env.REDIS_URL ||
  (process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
    : null);

let client = null;
let failed = false;
let connecting = null;

async function ensureClient() {
  if (!REDIS_ENABLED || failed || !REDIS_URL) return null;
  if (client) return client;

  try {
    connecting =
      connecting ||
      createClient({
        url: REDIS_URL,
        password: process.env.REDIS_PASSWORD,
        socket: {
          reconnectStrategy: (retries) =>
            Math.min(1000 * retries, 10_000), // capped backoff
        },
      })
        .on("error", (err) => {
          console.error("[redis] error", err.message);
        })
        .connect();

    client = await connecting;
    return client;
  } catch (err) {
    console.error("[redis] connect failed, disabling cache", err.message);
    failed = true; // do not keep retrying this process lifetime
    return null;
  } finally {
    connecting = null;
  }
}

function isEnabled() {
  return REDIS_ENABLED && !failed && !!REDIS_URL;
}

module.exports = {
  isEnabled,
  ensureClient,
};
