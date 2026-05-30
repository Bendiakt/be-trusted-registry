'use strict'

/**
 * tests/pacEarnings.test.js — P35
 *
 * Pure unit tests for PAC earnings aggregation and progress-criteria logic
 * mirroring backend/routes/pac.js.  No server or DB required.
 *
 * Coverage:
 *  - Earnings summary: totalEarnedCents, pendingCents, completedCount, paidCount
 *  - Commission fallback when commission_amount_cents is null
 *  - commissionPct = Math.round(commissionRate × 100)
 *  - commissionUsd toFixed(2) formatting
 *  - Score averaging (adminAvg, clientAvg) with zero-count guard
 *  - onTimeRate computation and zero guard
 *  - Progress pct = round(metCount / totalCount × 100)
 *  - S1→S2 criteria structure: 5 keys, thresholds, met/not-met
 *  - S2→S3 criteria structure: 8 keys, thresholds, met/not-met
 *  - S3 returns null criteria (targetTier = null)
 *
 * Usage:
 *   node --test tests/pacEarnings.test.js
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// ── Mirrored pure functions from pac.js /earnings ────────────────────────────

/**
 * Sum earned cents: missions where payment is confirmed AND commission set.
 */
function totalEarnedCents(missions) {
  return missions.reduce((sum, r) => {
    if (r.payment_confirmed_at && r.commission_amount_cents) return sum + r.commission_amount_cents
    return sum
  }, 0)
}

/**
 * Sum pending cents: completed + not yet paid + commission set.
 */
function pendingCents(missions) {
  return missions.reduce((sum, r) => {
    if (!r.payment_confirmed_at && r.status === 'completed' && r.commission_amount_cents) {
      return sum + r.commission_amount_cents
    }
    return sum
  }, 0)
}

/**
 * Count missions with status === 'completed'.
 */
function completedCount(missions) {
  return missions.filter(r => r.status === 'completed').length
}

/**
 * Count missions with a payment_confirmed_at timestamp.
 */
function paidCount(missions) {
  return missions.filter(r => r.payment_confirmed_at).length
}

/**
 * Commission percentage label: Math.round(rate × 100).
 */
function commissionPct(rate) {
  return Math.round(rate * 100)
}

/**
 * Commission amount for a mission.
 * Mirrors: commission_amount_cents || Math.round((fee_usd || 500) × rate × 100)
 */
function missionCommissionCents(commissionAmountCents, feeUsd, rate) {
  return commissionAmountCents || Math.round((feeUsd || 500) * rate * 100)
}

/**
 * Commission USD formatted to 2 decimal places.
 */
function commissionUsd(cents) {
  return +(cents / 100).toFixed(2)
}

// ── Mirrored pure functions from pac.js /progress ────────────────────────────

/**
 * Compute average score. Returns 0 when count is 0 (division guard).
 */
function scoreAvg(total, count) {
  return count > 0 ? +(total / count).toFixed(2) : 0
}

/**
 * On-time rate. Returns 0 when missions_completed is 0.
 */
function onTimeRate(on_time, completed) {
  return completed > 0 ? +(on_time / completed).toFixed(2) : 0
}

/**
 * Build S1→S2 criteria array.
 * Each entry: { key, value, target, met }
 */
function s1Criteria(p) {
  const adminAvg  = scoreAvg(p.admin_score_total, p.admin_score_count)
  const otr       = onTimeRate(p.missions_on_time, p.missions_completed)
  return [
    { key: 'missions',          value: p.missions_completed, target: 10,   met: p.missions_completed >= 10 },
    { key: 'admin_score',       value: adminAvg,             target: 4.0,  met: adminAvg >= 4.0 },
    { key: 'on_time_rate',      value: otr,                  target: 0.85, met: otr >= 0.85 },
    { key: 'double_rejections', value: p.double_rejections,  target: 0,    met: p.double_rejections === 0 },
    { key: 'seniority',         value: p.months_active,      target: 6,    met: p.months_active >= 6 },
  ]
}

/**
 * Build S2→S3 criteria array.
 */
function s2Criteria(p) {
  const adminAvg  = scoreAvg(p.admin_score_total,  p.admin_score_count)
  const clientAvg = scoreAvg(p.client_score_total, p.client_score_count)
  const otr       = onTimeRate(p.missions_on_time, p.missions_completed)
  return [
    { key: 'missions',         value: p.missions_completed,      target: 25,   met: p.missions_completed >= 25 },
    { key: 'l2_missions',      value: p.l2_missions_completed,   target: 10,   met: p.l2_missions_completed >= 10 },
    { key: 'admin_score',      value: adminAvg,                  target: 4.5,  met: adminAvg >= 4.5 },
    { key: 'client_score',     value: clientAvg,                 target: 4.3,  met: clientAvg >= 4.3 },
    { key: 'on_time_rate',     value: otr,                       target: 0.90, met: otr >= 0.90 },
    { key: 'supervised_s1',    value: p.supervised_s1_completed, target: 3,    met: p.supervised_s1_completed >= 3 },
    { key: 'no_disputes',      value: p.double_rejections,       target: 0,    met: p.double_rejections === 0 },
    { key: 'months_as_s2',     value: p.months_as_s2,            target: 12,   met: p.months_as_s2 >= 12 },
  ]
}

/**
 * Progress percentage from criteria array.
 */
function progressPct(criteria) {
  if (!criteria || criteria.length === 0) return 100
  const met = criteria.filter(c => c.met).length
  return Math.round((met / criteria.length) * 100)
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Earnings — totalEarnedCents', () => {
  test('sums commission for payment-confirmed missions', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: 5000, payment_confirmed_at: '2026-04-01T00:00:00Z' },
      { status: 'completed', commission_amount_cents: 3000, payment_confirmed_at: '2026-04-10T00:00:00Z' },
    ]
    assert.equal(totalEarnedCents(missions), 8000)
  })

  test('excludes missions without payment_confirmed_at', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: 5000, payment_confirmed_at: null },
      { status: 'completed', commission_amount_cents: 3000, payment_confirmed_at: '2026-04-10T00:00:00Z' },
    ]
    assert.equal(totalEarnedCents(missions), 3000)
  })

  test('excludes missions without commission_amount_cents', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: null, payment_confirmed_at: '2026-04-10T00:00:00Z' },
      { status: 'completed', commission_amount_cents: 2500, payment_confirmed_at: '2026-04-11T00:00:00Z' },
    ]
    assert.equal(totalEarnedCents(missions), 2500)
  })

  test('empty missions list → 0', () => {
    assert.equal(totalEarnedCents([]), 0)
  })

  test('all pending → 0 earned', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: 5000, payment_confirmed_at: null },
    ]
    assert.equal(totalEarnedCents(missions), 0)
  })
})

describe('Earnings — pendingCents', () => {
  test('sums commission for completed unpaid missions', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: 4000, payment_confirmed_at: null },
      { status: 'completed', commission_amount_cents: 2000, payment_confirmed_at: null },
    ]
    assert.equal(pendingCents(missions), 6000)
  })

  test('excludes paid missions from pending', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: 4000, payment_confirmed_at: '2026-04-01T00:00:00Z' },
      { status: 'completed', commission_amount_cents: 2000, payment_confirmed_at: null },
    ]
    assert.equal(pendingCents(missions), 2000)
  })

  test('excludes in-progress missions from pending', () => {
    const missions = [
      { status: 'in_progress', commission_amount_cents: 5000, payment_confirmed_at: null },
    ]
    assert.equal(pendingCents(missions), 0)
  })

  test('excludes missions without commission_amount_cents', () => {
    const missions = [
      { status: 'completed', commission_amount_cents: null, payment_confirmed_at: null },
    ]
    assert.equal(pendingCents(missions), 0)
  })

  test('empty list → 0', () => {
    assert.equal(pendingCents([]), 0)
  })
})

describe('Earnings — completedCount / paidCount', () => {
  const missions = [
    { status: 'completed',   payment_confirmed_at: '2026-04-01T00:00:00Z' },
    { status: 'completed',   payment_confirmed_at: null },
    { status: 'assigned',    payment_confirmed_at: null },
    { status: 'in_progress', payment_confirmed_at: null },
  ]

  test('completedCount counts only status=completed', () => {
    assert.equal(completedCount(missions), 2)
  })

  test('paidCount counts only missions with payment_confirmed_at', () => {
    assert.equal(paidCount(missions), 1)
  })

  test('empty list → 0 for both', () => {
    assert.equal(completedCount([]), 0)
    assert.equal(paidCount([]), 0)
  })
})

describe('Earnings — commissionPct', () => {
  test('10% rate → 10', () => {
    assert.equal(commissionPct(0.10), 10)
  })
  test('15% rate → 15', () => {
    assert.equal(commissionPct(0.15), 15)
  })
  test('20% rate → 20', () => {
    assert.equal(commissionPct(0.20), 20)
  })
  test('12.5% rate rounds to 13', () => {
    assert.equal(commissionPct(0.125), 13)
  })
})

describe('Earnings — commission fallback', () => {
  test('uses commission_amount_cents when present', () => {
    assert.equal(missionCommissionCents(3000, 500, 0.10), 3000)
  })
  test('falls back to fee_usd × rate when commission_amount_cents is 0/null', () => {
    // null → 0 (falsy) → fallback: round(500 × 0.10 × 100) = 5000
    assert.equal(missionCommissionCents(null, 500, 0.10), 5000)
    assert.equal(missionCommissionCents(0, 500, 0.10), 5000)
  })
  test('default fee_usd is 500 when null', () => {
    // round((null||500) × 0.10 × 100) = 5000
    assert.equal(missionCommissionCents(null, null, 0.10), 5000)
  })
  test('commissionUsd formats to 2 decimals', () => {
    assert.equal(commissionUsd(5000), 50.00)
    assert.equal(commissionUsd(3333), 33.33)
  })
})

describe('Progress — score averaging', () => {
  test('non-zero count → average', () => {
    assert.equal(scoreAvg(4.5 * 3, 3), 4.50)
  })
  test('zero count → 0 (no divide by zero)', () => {
    assert.equal(scoreAvg(0, 0), 0)
  })
  test('rounds to 2 decimal places', () => {
    // 14 / 3 = 4.666... → 4.67
    assert.equal(scoreAvg(14, 3), 4.67)
  })
  test('single review: 5.0 / 1 = 5.00', () => {
    assert.equal(scoreAvg(5.0, 1), 5.00)
  })
})

describe('Progress — onTimeRate', () => {
  test('3 on-time out of 4 → 0.75', () => {
    assert.equal(onTimeRate(3, 4), 0.75)
  })
  test('all on-time → 1.00', () => {
    assert.equal(onTimeRate(5, 5), 1.00)
  })
  test('zero missions → 0.00 (no divide by zero)', () => {
    assert.equal(onTimeRate(0, 0), 0.00)
  })
  test('none on-time → 0.00', () => {
    assert.equal(onTimeRate(0, 10), 0.00)
  })
})

describe('Progress — S1→S2 criteria', () => {
  const fullProfile = {
    missions_completed: 10, missions_on_time: 9,
    admin_score_total: 4.5, admin_score_count: 1,
    double_rejections: 0, months_active: 6,
  }

  test('all 5 criteria keys are present', () => {
    const c = s1Criteria(fullProfile)
    assert.equal(c.length, 5)
    const keys = c.map(x => x.key)
    assert.ok(keys.includes('missions'))
    assert.ok(keys.includes('admin_score'))
    assert.ok(keys.includes('on_time_rate'))
    assert.ok(keys.includes('double_rejections'))
    assert.ok(keys.includes('seniority'))
  })

  test('all criteria met with boundary values', () => {
    const c = s1Criteria(fullProfile)
    assert.ok(c.every(x => x.met), `Expected all met, got: ${JSON.stringify(c.filter(x=>!x.met))}`)
  })

  test('missing one mission → missions criterion not met', () => {
    const c = s1Criteria({ ...fullProfile, missions_completed: 9, missions_on_time: 8 })
    const m = c.find(x => x.key === 'missions')
    assert.ok(!m.met)
  })

  test('low admin score → admin_score criterion not met', () => {
    const c = s1Criteria({ ...fullProfile, admin_score_total: 3.9, admin_score_count: 1 })
    const m = c.find(x => x.key === 'admin_score')
    assert.ok(!m.met)
  })

  test('double rejection → double_rejections criterion not met', () => {
    const c = s1Criteria({ ...fullProfile, double_rejections: 1 })
    const m = c.find(x => x.key === 'double_rejections')
    assert.ok(!m.met)
  })

  test('target for missions is 10', () => {
    const c = s1Criteria(fullProfile)
    const m = c.find(x => x.key === 'missions')
    assert.equal(m.target, 10)
  })

  test('target for on_time_rate is 0.85', () => {
    const c = s1Criteria(fullProfile)
    const m = c.find(x => x.key === 'on_time_rate')
    assert.equal(m.target, 0.85)
  })
})

describe('Progress — S2→S3 criteria', () => {
  const fullS2 = {
    missions_completed: 25, l2_missions_completed: 10,
    missions_on_time: 23,
    admin_score_total: 4.5, admin_score_count: 1,
    client_score_total: 4.3, client_score_count: 1,
    supervised_s1_completed: 3, double_rejections: 0, months_as_s2: 12,
  }

  test('all 8 criteria keys are present', () => {
    const c = s2Criteria(fullS2)
    assert.equal(c.length, 8)
    const keys = c.map(x => x.key)
    assert.ok(keys.includes('missions'))
    assert.ok(keys.includes('l2_missions'))
    assert.ok(keys.includes('admin_score'))
    assert.ok(keys.includes('client_score'))
    assert.ok(keys.includes('on_time_rate'))
    assert.ok(keys.includes('supervised_s1'))
    assert.ok(keys.includes('no_disputes'))
    assert.ok(keys.includes('months_as_s2'))
  })

  test('all criteria met at boundary values', () => {
    const c = s2Criteria(fullS2)
    assert.ok(c.every(x => x.met), `Expected all met, got: ${JSON.stringify(c.filter(x=>!x.met))}`)
  })

  test('insufficient L2 missions → l2_missions not met', () => {
    const c = s2Criteria({ ...fullS2, l2_missions_completed: 9 })
    assert.ok(!c.find(x => x.key === 'l2_missions').met)
  })

  test('low client score → client_score not met', () => {
    const c = s2Criteria({ ...fullS2, client_score_total: 4.2, client_score_count: 1 })
    assert.ok(!c.find(x => x.key === 'client_score').met)
  })

  test('months_as_s2 below 12 → not met', () => {
    const c = s2Criteria({ ...fullS2, months_as_s2: 11 })
    assert.ok(!c.find(x => x.key === 'months_as_s2').met)
  })

  test('supervised_s1 < 3 → not met', () => {
    const c = s2Criteria({ ...fullS2, supervised_s1_completed: 2 })
    assert.ok(!c.find(x => x.key === 'supervised_s1').met)
  })

  test('target for l2_missions is 10', () => {
    const c = s2Criteria(fullS2)
    assert.equal(c.find(x => x.key === 'l2_missions').target, 10)
  })

  test('target for months_as_s2 is 12', () => {
    const c = s2Criteria(fullS2)
    assert.equal(c.find(x => x.key === 'months_as_s2').target, 12)
  })
})

describe('Progress — progressPct', () => {
  test('all criteria met → 100%', () => {
    const c = [{ met: true }, { met: true }, { met: true }]
    assert.equal(progressPct(c), 100)
  })

  test('3 of 5 met → 60%', () => {
    const c = [{ met: true }, { met: true }, { met: true }, { met: false }, { met: false }]
    assert.equal(progressPct(c), 60)
  })

  test('none met → 0%', () => {
    const c = [{ met: false }, { met: false }]
    assert.equal(progressPct(c), 0)
  })

  test('null/undefined criteria → 100% (S3 has no target)', () => {
    assert.equal(progressPct(null), 100)
    assert.equal(progressPct([]), 100)
  })

  test('rounds correctly: 1 of 3 → 33%', () => {
    const c = [{ met: true }, { met: false }, { met: false }]
    assert.equal(progressPct(c), 33)
  })

  test('S1 profile: 4 of 5 criteria met → 80%', () => {
    const p = {
      missions_completed: 10, missions_on_time: 9,
      admin_score_total: 4.5, admin_score_count: 1,
      double_rejections: 1,  // fails
      months_active: 6,
    }
    const c = s1Criteria(p)
    assert.equal(progressPct(c), 80)
  })
})
