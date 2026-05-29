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
  const { _prefix, ...rlOptions } = options
  const redis = require('./redis').getRedis()

  if (redis) {
    try {
      const { RedisStore } = require('rate-limit-redis')
      return rateLimit({
        ...rlOptions,
        standardHeaders: rlOptions.standardHeaders ?? true,
        legacyHeaders:   rlOptions.legacyHeaders   ?? false,
        store: new RedisStore({
          // Use ioredis sendCommand interface (rate-limit-redis v4).
          //
          // rate-limit-redis v4 wraps our function as:
          //   async ({ command }) => sendCommandFn(...command)
          // so we receive spread args e.g. ('SCRIPT', 'LOAD', sha) or ('EVALSHA', sha, ...).
          //
          // Critical: each Redis command expects a type-correct return value.
          // Returning 0 (number) for SCRIPT LOAD causes:
          //   TypeError: unexpected reply from redis client
          // because rate-limit-redis checks `typeof result !== 'string'`.
          // That TypeError becomes an unhandled rejection → process crash.
          //
          // Fail-open table:
          //   SCRIPT LOAD  → dummy SHA string (40 hex chars)
          //     → rate-limit-redis stores the dummy; EVALSHA with dummy gets
          //       NOSCRIPT from Redis → falls into retryableIncrement's catch
          //       → calls loadIncrementScript again → self-heals when Redis reconnects
          //   EVALSHA      → [0, 0] (totalHits=0, timeToExpire=0)
          //     → rate limiter sees 0 hits → allows request through
          //   default      → 0 (for INCRBY, DEL, DECR etc.)
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
              const cmd = String(args[0] || '').toUpperCase()
              if (cmd === 'SCRIPT')  return '0000000000000000000000000000000000000000'
              if (cmd === 'evalsha' || cmd === 'EVALSHA') return [0, 0]
              return 0
            }
          },
          // Prefix to namespace keys — avoids collisions with other Redis users
          prefix: _prefix || 'rl:',
        }),
      })
    } catch (e) {
      // rate-limit-redis may fail if ioredis hasn't connected yet; fall through
      console.warn(JSON.stringify({ event: 'rate_limiter.redis_store_failed', message: e.message, note: 'falling back to memory store' }))
    }
  }

  // Fallback: standard in-memory store
  return rateLimit({
    ...rlOptions,
    standardHeaders: rlOptions.standardHeaders ?? true,
    legacyHeaders:   rlOptions.legacyHeaders   ?? false,
  })
}
module.exports = { makeRateLimiter }
