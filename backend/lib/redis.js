'use strict'
/**
 * lib/redis.js — Shared Redis client (ioredis).
 *
 * Returns a singleton client when REDIS_URL is set.
 * Falls back to null gracefully — callers must handle the null case
 * (rate limiters fall back to in-memory, session store to DB, etc.).
 *
 * Usage:
 *   const { getRedis, isRedisAvailable } = require('./redis')
 *   const redis = getRedis()  // may be null
 */

let _client = null
let _initialized = false

const getRedis = () => {
  if (_initialized) return _client
  _initialized = true

  const url = process.env.REDIS_URL
  if (!url) {
    console.warn(JSON.stringify({
      event: 'redis.unavailable',
      note:  'REDIS_URL not set — rate limiters will use in-memory store (resets on restart)',
    }))
    return null
  }

  try {
    const Redis = require('ioredis')
    _client = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout:       3000,
      lazyConnect:          true,
      // Disable offline queue so commands fail fast rather than queuing indefinitely
      enableOfflineQueue:   false,
    })

    _client.on('connect',   () => console.log(JSON.stringify({ event: 'redis.connected', url: url.replace(/:[^:@]+@/, ':***@') })))
    _client.on('error',     (err) => console.error(JSON.stringify({ event: 'redis.error', message: err.message })))
    _client.on('reconnecting', () => console.log(JSON.stringify({ event: 'redis.reconnecting' })))

    _client.connect().catch(() => { /* handled by error event */ })
    return _client
  } catch (e) {
    console.error(JSON.stringify({ event: 'redis.init_failed', message: e.message }))
    return null
  }
}

const isRedisAvailable = () => {
  const r = getRedis()
  return r !== null && r.status === 'ready'
}

module.exports = { getRedis, isRedisAvailable }
