'use strict'
/**
 * tests/pacBonusCron.test.js — scheduling of the PAC bonus M+1 cron.
 *
 * Regression tests for:
 *  - the target period being derived from the boot date instead of the run date
 *    (a process booted on Nov 27 computed October on Dec 1);
 *  - setTimeout clamping delays above 2^31-1 ms to 1 ms, which turned the
 *    month-long reschedule into an immediate, endless re-run;
 *  - recalculation overwriting amounts of validated/paid statements.
 *
 * No database or network: db.query is stubbed, timers are simulated.
 *
 * Run: node --test tests/pacBonusCron.test.js
 */

const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const path   = require('node:path')

// Stub ../db before loading the cron so no pool is ever created.
const captured = []
const dbPath = require.resolve(path.join(__dirname, '..', 'db'))
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async (sql, params) => { captured.push({ sql, params }); return { rows: [] } } },
}

const { schedulePacBonusCron, _internal } = require('../lib/pacBonusCron')
const { nextRunAfter, previousMonthUTC, upsertBonusStatement, MAX_TIMEOUT_MS } = _internal

/** Simulated clock + timer queue. `drift` shifts each firing (negative = early). */
function fakeTimers (startIso, { drift = 0 } = {}) {
  let clock = Date.parse(startIso)
  const queue = []
  const delays = []
  return {
    now: () => clock,
    // Drift only applies to long waits, so a 1 ms re-arm can still land.
    setTimer: (fn, delay) => { delays.push(delay); queue.push({ fn, at: clock + delay + (delay > 1 ? drift : 0) }) },
    delays,
    async step () {
      const t = queue.shift()
      if (!t) return false
      clock = Math.max(clock, t.at)
      await t.fn()
      return true
    },
  }
}

const silence = (t) => {
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
}

describe('previousMonthUTC / nextRunAfter', () => {
  test('previous month of a December run date is November', () => {
    assert.deepEqual(previousMonthUTC(new Date('2026-12-01T02:00:00Z')), { year: 2026, month: 11 })
  })

  test('previous month of a January run date is December of the prior year', () => {
    assert.deepEqual(previousMonthUTC(new Date('2027-01-01T02:00:00Z')), { year: 2026, month: 12 })
  })

  test('next run is the next 1st at 02:00 UTC', () => {
    assert.equal(nextRunAfter(new Date('2026-11-27T20:36:00Z')).toISOString(), '2026-12-01T02:00:00.000Z')
    assert.equal(nextRunAfter(new Date('2026-12-31T23:59:00Z')).toISOString(), '2027-01-01T02:00:00.000Z')
  })
})

describe('schedulePacBonusCron', () => {
  beforeEach(() => { captured.length = 0 })

  test('boot on Nov 27 computes November on Dec 1, then December on Jan 1', async (t) => {
    silence(t)
    const timers = fakeTimers('2026-11-27T20:36:00Z')
    const calls = []
    schedulePacBonusCron({
      now: timers.now, setTimer: timers.setTimer,
      compute: async (y, m) => { calls.push({ y, m, at: new Date(timers.now()).toISOString() }) },
    })

    while (calls.length < 2 && await timers.step()) { /* advance */ }

    assert.deepEqual(calls, [
      { y: 2026, m: 11, at: '2026-12-01T02:00:00.000Z' },
      { y: 2026, m: 12, at: '2027-01-01T02:00:00.000Z' },
    ])
  })

  test('logs the period that will actually be computed', (t) => {
    const logs = []
    t.mock.method(console, 'log', (line) => logs.push(JSON.parse(line)))
    const timers = fakeTimers('2026-11-27T20:36:00Z')
    schedulePacBonusCron({ now: timers.now, setTimer: timers.setTimer, compute: async () => {} })
    assert.equal(logs[0].event, 'pac_bonus_cron_scheduled')
    assert.equal(logs[0].will_compute_period, '2026-11')
  })

  test('never passes setTimeout a delay above its 2^31-1 ms limit', async (t) => {
    silence(t)
    // Boot on the 1st right after a run: ~31 days to wait.
    const timers = fakeTimers('2026-12-01T02:00:01Z')
    const calls = []
    schedulePacBonusCron({
      now: timers.now, setTimer: timers.setTimer,
      compute: async (y, m) => { calls.push({ y, m }) },
    })
    while (calls.length < 1 && await timers.step()) { /* advance */ }

    assert.deepEqual(calls, [{ y: 2026, m: 12 }])
    assert.ok(timers.delays.length >= 2, 'a 31-day wait must be split')
    for (const d of timers.delays) assert.ok(d <= MAX_TIMEOUT_MS, `delay ${d} exceeds limit`)
  })

  test('a timer firing slightly early does not run twice nor the wrong month', async (t) => {
    silence(t)
    const timers = fakeTimers('2026-11-27T20:36:00Z', { drift: -1 })
    const calls = []
    schedulePacBonusCron({
      now: timers.now, setTimer: timers.setTimer,
      compute: async (y, m) => { calls.push({ y, m }) },
    })
    // Step until the second month would be reached.
    for (let i = 0; i < 20 && calls.length < 2; i++) await timers.step()

    assert.deepEqual(calls, [{ y: 2026, m: 11 }, { y: 2026, m: 12 }])
  })

  test('a failing run is logged and the cron keeps rescheduling', async (t) => {
    silence(t)
    const timers = fakeTimers('2026-11-27T20:36:00Z')
    let attempts = 0
    schedulePacBonusCron({
      now: timers.now, setTimer: timers.setTimer,
      compute: async () => { attempts++; throw new Error('db down') },
    })
    for (let i = 0; i < 20 && attempts < 2; i++) await timers.step()
    assert.equal(attempts, 2)
  })
})

describe('upsertBonusStatement', () => {
  test('only refreshes draft statements on conflict', async () => {
    captured.length = 0
    await upsertBonusStatement({
      supervisorId: 1, year: 2026, month: 11, bonusLevel: 'L1',
      count: 1, gross: 100, commissions: 10, net: 90,
      bonusRate: 0.05, bonusCents: 5, taskPct: 90, multiplier: 1, finalCents: 5,
    })
    assert.equal(captured.length, 1)
    assert.match(captured[0].sql, /DO UPDATE SET[\s\S]*WHERE pac_bonus_payouts\.status = 'draft'/)
  })
})
