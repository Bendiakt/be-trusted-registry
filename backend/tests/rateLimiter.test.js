'use strict'
/**
 * Unit tests for backend/lib/rateLimiter.js
 *
 * Covers the critical regression: when ioredis has enableOfflineQueue=false and
 * the connection drops, redis.call() throws. The sendCommand wrapper must catch
 * that error, log a warning, and return 0 (fail-open) instead of propagating
 * an unhandled rejection that crashes the process.
 *
 * Strategy: inject a fake redis object whose call() rejects, verify the
 * returned middleware doesn't reject and logs the expected warning.
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
