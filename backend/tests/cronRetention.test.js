'use strict'
/**
 * cronRetention.test.js — unit tests for runPiiRetention (lib/cronJobs.js).
 *
 * No database required. `../db` is stubbed via require.cache with a query spy
 * that records every SQL string + params so we can assert the retention sweeps.
 *
 * Usage:
 *   node --test tests/cronRetention.test.js
 */
const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

// ── DB stub with a recording query spy ────────────────────────────────────────
const calls = []
const dbPath = require.resolve('../db')
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, params) => {
      calls.push({ sql, params })
      return { rowCount: 0, rows: [] }
    },
    getPool: () => {},
    initDb: async () => {},
  },
}

const { runPiiRetention } = require('../lib/cronJobs')

const find = (re) => calls.find((c) => re.test(c.sql))

describe('runPiiRetention', () => {
  beforeEach(() => { calls.length = 0 })

  test('issues all three retention sweeps', async () => {
    await runPiiRetention()
    assert.ok(find(/DELETE FROM api_key_usage/i), 'api_key_usage purge missing')
    assert.ok(find(/DELETE FROM audit_log/i),     'audit_log purge missing')
    assert.ok(find(/DELETE FROM notifications/i), 'notifications purge missing')
  })

  test('notifications purge uses a day-interval param (default 90)', async () => {
    await runPiiRetention()
    const notif = find(/DELETE FROM notifications/i)
    assert.match(notif.sql, /created_at < NOW\(\) -/i)
    assert.deepEqual(notif.params, [90])
  })

  test('audit_log purge is scoped to anonymised accounts only', async () => {
    await runPiiRetention()
    const audit = find(/DELETE FROM audit_log/i)
    assert.match(audit.sql, /@deleted\.invalid/)
    assert.deepEqual(audit.params, [730])
  })

  test('RETENTION_NOTIFICATIONS_DAYS overrides the default', async () => {
    const prev = process.env.RETENTION_NOTIFICATIONS_DAYS
    process.env.RETENTION_NOTIFICATIONS_DAYS = '30'
    try {
      await runPiiRetention()
      const notif = find(/DELETE FROM notifications/i)
      assert.deepEqual(notif.params, [30])
    } finally {
      if (prev === undefined) delete process.env.RETENTION_NOTIFICATIONS_DAYS
      else process.env.RETENTION_NOTIFICATIONS_DAYS = prev
    }
  })

  test('never throws even if a query rejects', async () => {
    const orig = require('../db').query
    require('../db').query = async () => { throw new Error('db down') }
    try {
      await assert.doesNotReject(runPiiRetention())
    } finally {
      require('../db').query = orig
    }
  })
})
