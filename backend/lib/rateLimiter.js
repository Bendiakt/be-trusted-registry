'use strict'
/**
 * lib/rateLimiter.js — Drop-in express-rate-limit factory with Redis store.
 *
 * When REDIS_URL is set and the client is ready, rate limit counters are stored
 * in Redis and survive process restarts / horizontal scaling.
 * When Redis is unavailable the factory falls back to the default in-memory store
 * transparently — no crash, just a warning already emitted by lib/redis.js.
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
          // Use ioredis sendCommand interface (rate-limit-redis v4)
          sendCommand: (...args) => redis.call(...args),
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
