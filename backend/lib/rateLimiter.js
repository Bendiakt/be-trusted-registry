'use strict'
/**
 * lib/rateLimiter.js — Drop-in express-rate-limit factory with Redis store.
 *
 * When REDIS_URL is set and the client is ready, rate limit counters are stored
 * in Redis and survive process restarts / horizontal scaling.
 * When Redis is unavailable (or disconnects mid-operation) the factory falls back
 * to the default in-memory store transparently — no crash, no unhandled rejection.
 *
 * Usage (replaces direct rateLimit() calls):
 *   const { makeRateLimiter } = require('../lib/rateLimiter')
 *   const loginLimiter = makeRateLimiter({ windowMs: 15 * 60_000, max: 10, ... })
 */

const rateLimit = require('express-rate-limit')

/**
 * makeRateLimiter(options) → express middleware
 *
 * Accepts all standard express-rate-limit options.
 * The `store` option is set automatically when Redis is available.
 *
 * Fail-open on Redis errors: when `enableOfflineQueue` is false and the
 * connection drops, redis.call() throws synchronously. We catch that in the
 * sendCommand wrapper and return a safe no-op value so the rate limiter lets
 * the request through rather than crashing with an unhandled rejection.
 */
const makeRateLimiter = (options = {}) => {
  const redis = require('./redis').getRedis()

  if (redis) {
    try {
      const { RedisStore } = require('rate-limit-redis')
      return rateLimit({
        ...options,
        standardHeaders: options.standardHeaders ?? true,
        legacyHeaders:   options.legacyHeaders   ?? false,
        store: new RedisStore({
          // Use ioredis sendCommand interface (rate-limit-redis v4).
          // Wrapped in a try/catch so that transient Redis disconnects
          // ("Stream isn't writeable and enableOfflineQueue is false") are
          // absorbed here rather than surfacing as unhandled rejections.
          // On error we fail-open: return 0 for INCRBY so the limiter sees
          // zero hits and allows the request through.
          sendCommand: async (...args) => {
            try {
              return await redis.call(...args)
            } catch (err) {
              console.warn(JSON.stringify({
                event:   'rate_limiter.redis_send_failed',
                command: args[0],
                message: err.message,
                note:    'failing open — request allowed through',
              }))
              return 0
            }
          },
          // Prefix to namespace keys — avoids collisions with other Redis users
          prefix: options._prefix || 'rl:',
        }),
      })
    } catch (e) {
      // rate-limit-redis may fail if ioredis hasn't connected yet; fall through
      console.warn(JSON.stringify({ event: 'rate_limiter.redis_store_failed', message: e.message, note: 'falling back to memory store' }))
    }
  }

  // Fallback: standard in-memory store
  return rateLimit({
    ...options,
    standardHeaders: options.standardHeaders ?? true,
    legacyHeaders:   options.legacyHeaders   ?? false,
  })
}

module.exports = { makeRateLimiter }
