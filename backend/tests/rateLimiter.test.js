'use strict'
/**
 * Unit tests for backend/lib/rateLimiter.js
 *
 * Covers two crash-loop regressions:
 *
 * PR #105 regression (MYDD-BACKEND-9):
 *   When ioredis has enableOfflineQueue=false and the connection drops,
 *   redis.call() throws. The sendCommand wrapper must catch that error and
 *   return 0 (fail-open) instead of propagating an unhandled rejection.
 *
 * MYDD-BACKEND-9 v2 (rate-limit-redis SCRIPT LOAD crash):
 *   rate-limit-redis v4 calls sendCommand('SCRIPT', 'LOAD', luaScript) and
 *   checks `typeof result !== 'string'`. Returning 0 (number) causes:
 *     TypeError: unexpected reply from redis client
 *   → unhandled rejection → Railway crash loop.
 *
 *   Fix: sendCommand must return command-specific types on failure:
 *     SCRIPT LOAD → string (dummy SHA)
 *     EVALSHA     → [0, 0] (fail-open: 0 hits, pass request through)
 *     default     → 0
 *
 * Strategy: inject a fake redis object whose call() rejects, verify the
 * returned middleware doesn't reject and returns correct typed values.
 */

const { test, describe, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Capture console.warn output during a call */
async function captureWarn(fn) {
  const logs = []
  const orig = console.warn
  console.warn = (...args) => logs.push(args.join(' '))
  try { await fn() } finally { console.warn = orig }
  return logs
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('makeRateLimiter — Redis offline crash guard', () => {
  // We need to clear the module registry between tests so we can inject
  // different redis behaviours.
  const MODULES = ['../lib/rateLimiter', '../lib/redis']

  beforeEach(() => { MODULES.forEach(m => { try { delete require.cache[require.resolve(m)] } catch {} }) })
  afterEach  (() => { MODULES.forEach(m => { try { delete require.cache[require.resolve(m)] } catch {} }) })

  test('falls back to memory store when redis is null', () => {
    // Stub redis to return null (no REDIS_URL set)
    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'),
      filename: require.resolve('../lib/redis'),
      loaded: true,
      exports: { getRedis: () => null, isRedisAvailable: () => false },
    }
    const { makeRateLimiter } = require('../lib/rateLimiter')
    const mw = makeRateLimiter({ windowMs: 1000, max: 10 })
    assert.equal(typeof mw, 'function', 'should return express middleware function')
  })

  test('sendCommand catches redis.call rejection and returns 0 (fail-open)', async () => {
    // Simulate ioredis with enableOfflineQueue=false that throws on call()
    const offlineError = new Error('Stream isn\'t writeable and enableOfflineQueue options is false')
    const fakeRedis = {
      call: async () => { throw offlineError },
    }

    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'),
      filename: require.resolve('../lib/redis'),
      loaded: true,
      exports: { getRedis: () => fakeRedis, isRedisAvailable: () => false },
    }

    // Also stub rate-limit-redis so we can intercept sendCommand
    let capturedSendCommand = null
    const FakeRedisStore = class {
      constructor ({ sendCommand }) { capturedSendCommand = sendCommand }
      async increment () { return { totalHits: 0, resetTime: new Date() } }
    }
    require.cache[require.resolve('rate-limit-redis')] = {
      id: require.resolve('rate-limit-redis'),
      filename: require.resolve('rate-limit-redis'),
      loaded: true,
      exports: { RedisStore: FakeRedisStore },
    }

    const { makeRateLimiter } = require('../lib/rateLimiter')
    makeRateLimiter({ windowMs: 1000, max: 10 })

    assert.ok(capturedSendCommand, 'sendCommand should have been captured by RedisStore')

    // Call sendCommand with a fake INCRBY command — should NOT throw
    let result
    const warns = await captureWarn(async () => {
      result = await capturedSendCommand('INCRBY', 'rl:test', 1)
    })

    assert.equal(result, 0, 'sendCommand should return 0 on redis failure (fail-open)')
    assert.ok(warns.some(w => w.includes('rate_limiter.redis_send_failed')), 'should log a rate_limiter.redis_send_failed warning')
    assert.ok(warns.some(w => w.includes('failing open')), 'log should mention failing open')

    // Clean up rate-limit-redis stub
    delete require.cache[require.resolve('rate-limit-redis')]
  })

  test('sendCommand does NOT propagate unhandled rejection on redis disconnect', async () => {
    const offlineError = new Error('Stream isn\'t writeable and enableOfflineQueue options is false')
    const fakeRedis = { call: async () => { throw offlineError } }

    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'),
      filename: require.resolve('../lib/redis'),
      loaded: true,
      exports: { getRedis: () => fakeRedis, isRedisAvailable: () => false },
    }

    let capturedSendCommand = null
    const FakeRedisStore = class {
      constructor ({ sendCommand }) { capturedSendCommand = sendCommand }
    }
    require.cache[require.resolve('rate-limit-redis')] = {
      id: require.resolve('rate-limit-redis'),
      filename: require.resolve('rate-limit-redis'),
      loaded: true,
      exports: { RedisStore: FakeRedisStore },
    }

    const { makeRateLimiter } = require('../lib/rateLimiter')
    makeRateLimiter({ windowMs: 1000, max: 10 })

    // This must resolve (not reject) even though redis.call() throws
    await assert.doesNotReject(
      () => captureWarn(() => capturedSendCommand('PEXPIRE', 'rl:test', 60000)),
      'sendCommand must not propagate the rejection',
    )

    delete require.cache[require.resolve('rate-limit-redis')]
  })

  // ── MYDD-BACKEND-9 v2 — SCRIPT LOAD type safety ──────────────────────────

  test('SCRIPT LOAD offline → returns string (not number) to prevent TypeError crash', async () => {
    // rate-limit-redis v4 checks `typeof result !== 'string'` after SCRIPT LOAD.
    // Returning 0 (number) causes TypeError → unhandled rejection → crash loop.
    const offlineError = new Error('Stream isn\'t writeable and enableOfflineQueue options is false')
    const fakeRedis = { call: async () => { throw offlineError } }

    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'), filename: require.resolve('../lib/redis'), loaded: true,
      exports: { getRedis: () => fakeRedis, isRedisAvailable: () => false },
    }

    let capturedSendCommand = null
    require.cache[require.resolve('rate-limit-redis')] = {
      id: require.resolve('rate-limit-redis'), filename: require.resolve('rate-limit-redis'), loaded: true,
      exports: { RedisStore: class { constructor ({ sendCommand }) { capturedSendCommand = sendCommand } } },
    }

    const { makeRateLimiter } = require('../lib/rateLimiter')
    makeRateLimiter({ windowMs: 1000, max: 10 })

    // Simulate rate-limit-redis calling sendCommand for SCRIPT LOAD
    // (rate-limit-redis v4 wraps our fn: ({ command }) => sendCommandFn(...command))
    let result
    await captureWarn(async () => { result = await capturedSendCommand('SCRIPT', 'LOAD', 'return 1') })

    assert.equal(typeof result, 'string', 'SCRIPT LOAD must return a string — not number — to avoid TypeError crash')
    assert.equal(result.length, 40, 'dummy SHA should be 40 characters (valid SHA1 length)')

    delete require.cache[require.resolve('rate-limit-redis')]
  })

  test('SCRIPT LOAD crash does NOT propagate as unhandled rejection', async () => {
    const offlineError = new Error('Stream isn\'t writeable and enableOfflineQueue options is false')
    const fakeRedis = { call: async () => { throw offlineError } }

    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'), filename: require.resolve('../lib/redis'), loaded: true,
      exports: { getRedis: () => fakeRedis, isRedisAvailable: () => false },
    }

    let capturedSendCommand = null
    require.cache[require.resolve('rate-limit-redis')] = {
      id: require.resolve('rate-limit-redis'), filename: require.resolve('rate-limit-redis'), loaded: true,
      exports: { RedisStore: class { constructor ({ sendCommand }) { capturedSendCommand = sendCommand } } },
    }

    const { makeRateLimiter } = require('../lib/rateLimiter')
    makeRateLimiter({ windowMs: 1000, max: 10 })

    // Simulate the exact sequence rate-limit-redis performs at store construction:
    // 1. sendCommand('SCRIPT', 'LOAD', luaScript) → our dummy SHA (string)
    // 2. rate-limit-redis does: if (typeof sha !== 'string') throw TypeError
    // Step 2 must NOT throw — so the Promise must resolve, not reject.
    await assert.doesNotReject(
      () => captureWarn(() => capturedSendCommand('SCRIPT', 'LOAD', 'return {1,2}')),
      'SCRIPT LOAD must not cause TypeError or unhandled rejection',
    )

    delete require.cache[require.resolve('rate-limit-redis')]
  })

  test('EVALSHA offline → returns [0, 0] (fail-open array, not number)', async () => {
    // rate-limit-redis v4 destructures EVALSHA result: const [totalHits, timeToExpire] = result
    // Returning 0 (number) would give totalHits=undefined, timeToExpire=undefined.
    // Returning [0, 0] gives totalHits=0 (allow) + no reset time.
    const offlineError = new Error('NOSCRIPT No matching script')
    const fakeRedis = { call: async () => { throw offlineError } }

    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'), filename: require.resolve('../lib/redis'), loaded: true,
      exports: { getRedis: () => fakeRedis, isRedisAvailable: () => false },
    }

    let capturedSendCommand = null
    require.cache[require.resolve('rate-limit-redis')] = {
      id: require.resolve('rate-limit-redis'), filename: require.resolve('rate-limit-redis'), loaded: true,
      exports: { RedisStore: class { constructor ({ sendCommand }) { capturedSendCommand = sendCommand } } },
    }

    const { makeRateLimiter } = require('../lib/rateLimiter')
    makeRateLimiter({ windowMs: 1000, max: 10 })

    let result
    await captureWarn(async () => { result = await capturedSendCommand('EVALSHA', '0'.repeat(40), '1', 'rl:key') })

    assert.ok(Array.isArray(result), 'EVALSHA fail-open must return an array (not a number)')
    assert.equal(result[0], 0, 'totalHits should be 0 (fail-open: allow request)')
    assert.equal(result[1], 0, 'timeToExpire should be 0')

    delete require.cache[require.resolve('rate-limit-redis')]
  })

  test('sendCommand passes through result when redis is healthy', async () => {
    const fakeRedis = { call: async (...args) => args[0] === 'INCRBY' ? 3 : 1 }

    require.cache[require.resolve('../lib/redis')] = {
      id: require.resolve('../lib/redis'),
      filename: require.resolve('../lib/redis'),
      loaded: true,
      exports: { getRedis: () => fakeRedis, isRedisAvailable: () => true },
    }

    let capturedSendCommand = null
    const FakeRedisStore = class {
      constructor ({ sendCommand }) { capturedSendCommand = sendCommand }
    }
    require.cache[require.resolve('rate-limit-redis')] = {
      id: require.resolve('rate-limit-redis'),
      filename: require.resolve('rate-limit-redis'),
      loaded: true,
      exports: { RedisStore: FakeRedisStore },
    }

    const { makeRateLimiter } = require('../lib/rateLimiter')
    makeRateLimiter({ windowMs: 1000, max: 10 })

    const result = await capturedSendCommand('INCRBY', 'rl:test', 1)
    assert.equal(result, 3, 'sendCommand should return the redis result when healthy')

    delete require.cache[require.resolve('rate-limit-redis')]
  })
})
