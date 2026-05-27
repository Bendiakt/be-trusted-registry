'use strict'

/**
 * tests/earnings.test.js
 *
 * Unit tests for the PAC earnings computation logic.
 * Tests the aggregate calculations from GET /api/pac/earnings:
 *   - totalEarnedCents (paid missions)
 *   - pendingCents (completed but unpaid)
 *   - commission fallback calculation
 *   - commissionPct / commissionRate formatting
 *
 * No DB or network required.
 *
 * Usage:
 *   node --test tests/earnings.test.js
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// ── Inline mirrors of route aggregation logic ─────────────────────────────────

/**
 * Compute totalEarnedCents: sum commission_amount_cents for paid missions.
 * Mirrors: rows.reduce — payment_confirmed_at && commission_amount_cents
 */
function totalEarnedCents(rows) {
  return rows.reduce((sum, r) => {
    if (r.payment_confirmed_at && r.commission_amount_cents) return sum + r.commission_amount_cents
    return sum
  }, 0)
}

/**
 * Compute pendingCents: completed missions without payment_confirmed_at.
 * Mirrors: rows.reduce — !payment_confirmed_at && status === 'completed'
 */
function pendingCents(rows) {
  return rows.reduce((sum, r) => {
    if (!r.payment_confirmed_at && r.status === 'completed' && r.commission_amount_cents) return sum + r.commission_amount_cents
    return sum
  }, 0)
}

/**
 * Compute commission for a mission when commission_amount_cents is null.
 * Mirrors: Math.round((fee_usd || 500) * commissionRate * 100)
 */
function fallbackCommissionCents(feeUsd, commissionRate) {
  return Math.round((feeUsd || 500) * commissionRate * 100)
}

/**
 * Convert commission rate (float) to display percentage.
 * Mirrors: Math.round(commissionRate * 100)
 */
function toCommissionPct(rate) {
  return Math.round(rate * 100)
}

/**
 * Convert cents to USD string with 2 decimal places.
 * Mirrors: +(cents / 100).toFixed(2)
 */
function centsToUsd(cents) {
  return +(cents / 100).toFixed(2)
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const paid = (overrides = {}) => ({
  id: 1, fee_usd: 500, commission_amount_cents: 5000,
  payment_confirmed_at: '2026-05-01T10:00:00Z',
  status: 'completed', outcome: 'pass',
  ...overrides,
})

const completed = (overrides = {}) => ({
  id: 2, fee_usd: 500, commission_amount_cents: 5000,
  payment_confirmed_at: null,
  status: 'completed', outcome: 'pass',
  ...overrides,
})

const inProgress = (overrides = {}) => ({
  id: 3, fee_usd: 500, commission_amount_cents: null,
  payment_confirmed_at: null,
  status: 'in_progress',
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('earnings — totalEarnedCents', () => {
  test('empty missions → 0', () => {
    assert.equal(totalEarnedCents([]), 0)
  })

  test('one paid mission → its commission_amount_cents', () => {
    assert.equal(totalEarnedCents([paid()]), 5000)
  })

  test('three paid missions → sum', () => {
    assert.equal(totalEarnedCents([paid(), paid({ id: 2, commission_amount_cents: 7500 }), paid({ id: 3, commission_amount_cents: 10000 })]), 22500)
  })

  test('unpaid completed mission NOT counted', () => {
    assert.equal(totalEarnedCents([completed()]), 0)
  })

  test('in-progress mission NOT counted', () => {
    assert.equal(totalEarnedCents([inProgress()]), 0)
  })

  test('mixed — only paid counted', () => {
    const rows = [paid(), completed(), inProgress(), paid({ id: 10, commission_amount_cents: 3000 })]
    assert.equal(totalEarnedCents(rows), 8000)
  })

  test('paid mission with null commission → 0 contribution', () => {
    // Should not add NaN/undefined — commission_amount_cents null means no value
    assert.equal(totalEarnedCents([paid({ commission_amount_cents: null })]), 0)
  })
})

describe('earnings — pendingCents', () => {
  test('empty missions → 0', () => {
    assert.equal(pendingCents([]), 0)
  })

  test('completed but unpaid → counted', () => {
    assert.equal(pendingCents([completed()]), 5000)
  })

  test('paid mission NOT counted as pending', () => {
    assert.equal(pendingCents([paid()]), 0)
  })

  test('in-progress mission NOT counted as pending', () => {
    assert.equal(pendingCents([inProgress({ commission_amount_cents: 5000 })]), 0)
  })

  test('multiple pending missions → sum', () => {
    assert.equal(pendingCents([completed(), completed({ id: 5, commission_amount_cents: 7500 })]), 12500)
  })

  test('completed without commission_amount_cents → 0 contribution', () => {
    assert.equal(pendingCents([completed({ commission_amount_cents: null })]), 0)
  })
})

describe('earnings — fallback commission calculation', () => {
  test('$500 fee × 10% = 5 000 cents', () => {
    assert.equal(fallbackCommissionCents(500, 0.10), 5000)
  })

  test('$500 fee × 15% = 7 500 cents', () => {
    assert.equal(fallbackCommissionCents(500, 0.15), 7500)
  })

  test('null fee defaults to $500', () => {
    assert.equal(fallbackCommissionCents(null, 0.10), 5000)
  })

  test('$750 fee × 20% = 15 000 cents', () => {
    assert.equal(fallbackCommissionCents(750, 0.20), 15000)
  })
})

describe('earnings — commission display formatting', () => {
  test('0.10 → 10%', () => {
    assert.equal(toCommissionPct(0.10), 10)
  })

  test('0.15 → 15%', () => {
    assert.equal(toCommissionPct(0.15), 15)
  })

  test('0.20 → 20%', () => {
    assert.equal(toCommissionPct(0.20), 20)
  })

  test('50 cents → $0.50', () => {
    assert.equal(centsToUsd(50), 0.50)
  })

  test('5000 cents → $50.00', () => {
    assert.equal(centsToUsd(5000), 50.00)
  })

  test('5001 cents → $50.01', () => {
    assert.equal(centsToUsd(5001), 50.01)
  })

  test('0 cents → $0.00', () => {
    assert.equal(centsToUsd(0), 0.00)
  })
})

describe('earnings — counts', () => {
  test('completedCount is count of completed-status missions', () => {
    const rows = [paid(), completed(), inProgress()]
    const completedCount = rows.filter(r => r.status === 'completed').length
    assert.equal(completedCount, 2)
  })

  test('paidCount is count of missions with payment_confirmed_at', () => {
    const rows = [paid(), completed(), inProgress()]
    const paidCount = rows.filter(r => r.payment_confirmed_at).length
    assert.equal(paidCount, 1)
  })

  test('zero missions → both counts are 0', () => {
    const rows = []
    assert.equal(rows.filter(r => r.status === 'completed').length, 0)
    assert.equal(rows.filter(r => r.payment_confirmed_at).length, 0)
  })
})
