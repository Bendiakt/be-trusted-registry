'use strict'

/**
 * tests/pacSupervision.test.js — P34
 *
 * Pure unit tests for PAC supervision business logic mirroring
 * backend/routes/pacSupervision.js.  No server or DB required.
 *
 * Usage:
 *   node --test tests/pacSupervision.test.js
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// ── Constants mirrored from pacSupervision.js ────────────────────────────────

const MAX_SUPERVISED  = { S2: 10, S3: 5 }
const BONUS_RATE      = { L1: 0.05, L2: 0.02 }
const COMMISSION_RATE = { S1: 0.10, S2: 0.15, S3: 0.20 }
const MIN_MISSIONS    = { S2: 5, S3: 10 }

const VALID_TASK_TYPES = [
  'weekly_checkin', 'weekly_report_review', 'weekly_mentoring', 'weekly_spot_check',
  'monthly_supervision_report', 'monthly_training', 'monthly_executive_report',
  'monthly_strategic_session', 'quarterly_s2_evaluation', 'ad_hoc_escalation',
]

// ── Business-logic mirrors ─────────────────────────────────────────────────────

/**
 * Can `supervisorTier` supervise `supervisedTier`?
 * S2 → S1, S3 → S2
 */
function canSupervise(supervisorTier, supervisedTier) {
  const allowed = supervisorTier === 'S2' ? 'S1' : supervisorTier === 'S3' ? 'S2' : null
  return allowed !== null && supervisedTier === allowed
}

/**
 * Has the supervisor reached capacity?
 */
function atCapacity(tier, currentCount) {
  return currentCount >= MAX_SUPERVISED[tier]
}

/**
 * Is this task type valid?
 */
function isValidTaskType(taskType) {
  return VALID_TASK_TYPES.includes(taskType)
}

/**
 * Compute bonus multiplier from completion percentage.
 * Mirrors: completionPct >= 80 ? 1.0 : completionPct >= 70 ? 0.5 : 0
 */
function bonusMultiplier(completionPct) {
  if (completionPct >= 80) return 1.0
  if (completionPct >= 70) return 0.5
  return 0
}

/**
 * Bonus status label from multiplier.
 */
function bonusStatus(multiplier) {
  if (multiplier === 1.0) return 'full'
  if (multiplier === 0.5) return 'half'
  return 'suspended'
}

/**
 * Completion percentage from completed / total (0 when total = 0).
 */
function completionPct(completed, total) {
  if (total === 0) return 0
  return Math.round(completed / total * 100)
}

/**
 * Simulator: estimate monthly bonus.
 */
function simulate({ supervisees, missions_month, avg_fee_usd, supervisee_tier, tier }) {
  const n           = Math.min(supervisees, MAX_SUPERVISED[tier])
  const totalMiss   = n * missions_month
  const gross       = totalMiss * avg_fee_usd
  const commRate    = COMMISSION_RATE[supervisee_tier] || 0.10
  const commissions = Math.round(gross * commRate)
  const netBE       = gross - commissions
  const bonus       = Math.round(netBE * BONUS_RATE.L1)
  return { n, totalMiss, gross, commissions, netBE, bonus, annual: bonus * 12 }
}

/**
 * Org tree totals for an S3 agent.
 */
function orgTotals(s2List) {
  return {
    total_s2s: s2List.length,
    total_s1s: s2List.reduce((sum, s2) => sum + (s2.s1s ? s2.s1s.length : 0), 0),
  }
}

/**
 * Sum total paid cents from bonus history.
 */
function totalPaidCents(history) {
  return history
    .filter(r => r.status === 'paid')
    .reduce((s, r) => s + (r.final_bonus_cents || 0), 0)
}

/**
 * Admin bonus statement summary (draft + validated totals).
 */
function bonusSummary(statements) {
  const draftCents     = statements.filter(r => r.status === 'draft').reduce((s, r) => s + (r.final_bonus_cents || 0), 0)
  const validatedCents = statements.filter(r => r.status === 'validated').reduce((s, r) => s + (r.final_bonus_cents || 0), 0)
  return {
    total_draft_usd:     (draftCents / 100).toFixed(2),
    total_validated_usd: (validatedCents / 100).toFixed(2),
    count:               statements.length,
  }
}

/**
 * Upgrade tier guard.
 * Returns nextTier or null (already S3).
 */
function nextTier(currentTier) {
  if (currentTier === 'S1') return 'S2'
  if (currentTier === 'S2') return 'S3'
  return null
}

/**
 * Mission count gate for tier upgrade.
 */
function meetsUpgradeMissions(currentTier, completedMissions) {
  const target = nextTier(currentTier)
  if (!target) return false
  return completedMissions >= MIN_MISSIONS[target]
}

/**
 * Guard: payment_reference required for bonus pay.
 */
function paymentReferenceGuard(paymentReference) {
  if (!paymentReference) return { ok: false, status: 400, error: 'payment_reference required (SWIFT/SEPA ref)' }
  return { ok: true }
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Constants — tier config', () => {
  test('MAX_SUPERVISED S2 is 10', () => {
    assert.equal(MAX_SUPERVISED.S2, 10)
  })
  test('MAX_SUPERVISED S3 is 5', () => {
    assert.equal(MAX_SUPERVISED.S3, 5)
  })
  test('BONUS_RATE L1 is 5%', () => {
    assert.equal(BONUS_RATE.L1, 0.05)
  })
  test('BONUS_RATE L2 is 2%', () => {
    assert.equal(BONUS_RATE.L2, 0.02)
  })
  test('COMMISSION_RATE S1 is 10%', () => {
    assert.equal(COMMISSION_RATE.S1, 0.10)
  })
  test('COMMISSION_RATE S2 is 15%', () => {
    assert.equal(COMMISSION_RATE.S2, 0.15)
  })
  test('COMMISSION_RATE S3 is 20%', () => {
    assert.equal(COMMISSION_RATE.S3, 0.20)
  })
})

describe('Supervision tier hierarchy', () => {
  test('S2 can supervise S1', () => {
    assert.ok(canSupervise('S2', 'S1'))
  })
  test('S3 can supervise S2', () => {
    assert.ok(canSupervise('S3', 'S2'))
  })
  test('S2 cannot supervise S2', () => {
    assert.ok(!canSupervise('S2', 'S2'))
  })
  test('S3 cannot supervise S1 directly', () => {
    assert.ok(!canSupervise('S3', 'S1'))
  })
  test('S1 cannot supervise anyone', () => {
    assert.ok(!canSupervise('S1', 'S1'))
    assert.ok(!canSupervise('S1', 'S2'))
  })
  test('unknown tier cannot supervise', () => {
    assert.ok(!canSupervise('S4', 'S1'))
  })
})

describe('Supervision capacity', () => {
  test('S2 at capacity when currentCount = 10', () => {
    assert.ok(atCapacity('S2', 10))
  })
  test('S2 not at capacity when currentCount = 9', () => {
    assert.ok(!atCapacity('S2', 9))
  })
  test('S3 at capacity when currentCount = 5', () => {
    assert.ok(atCapacity('S3', 5))
  })
  test('S3 not at capacity when currentCount = 4', () => {
    assert.ok(!atCapacity('S3', 4))
  })
  test('S3 at capacity when currentCount exceeds limit', () => {
    assert.ok(atCapacity('S3', 6))
  })
})

describe('Task type validation', () => {
  test('weekly_checkin is valid', () => {
    assert.ok(isValidTaskType('weekly_checkin'))
  })
  test('monthly_executive_report is valid', () => {
    assert.ok(isValidTaskType('monthly_executive_report'))
  })
  test('ad_hoc_escalation is valid', () => {
    assert.ok(isValidTaskType('ad_hoc_escalation'))
  })
  test('quarterly_s2_evaluation is valid', () => {
    assert.ok(isValidTaskType('quarterly_s2_evaluation'))
  })
  test('all 10 task types are valid', () => {
    assert.equal(VALID_TASK_TYPES.length, 10)
    for (const t of VALID_TASK_TYPES) assert.ok(isValidTaskType(t), `Expected ${t} to be valid`)
  })
  test('unknown_task is rejected', () => {
    assert.ok(!isValidTaskType('unknown_task'))
  })
  test('empty string is rejected', () => {
    assert.ok(!isValidTaskType(''))
  })
  test('monthly_supervision_report is valid', () => {
    assert.ok(isValidTaskType('monthly_supervision_report'))
  })
})

describe('Bonus multiplier', () => {
  test('100% completion → multiplier 1.0', () => {
    assert.equal(bonusMultiplier(100), 1.0)
  })
  test('80% completion → multiplier 1.0', () => {
    assert.equal(bonusMultiplier(80), 1.0)
  })
  test('79% completion → multiplier 0.5', () => {
    assert.equal(bonusMultiplier(79), 0.5)
  })
  test('70% completion → multiplier 0.5', () => {
    assert.equal(bonusMultiplier(70), 0.5)
  })
  test('69% completion → multiplier 0', () => {
    assert.equal(bonusMultiplier(69), 0)
  })
  test('0% completion → multiplier 0', () => {
    assert.equal(bonusMultiplier(0), 0)
  })
  test('multiplier 1.0 → status "full"', () => {
    assert.equal(bonusStatus(1.0), 'full')
  })
  test('multiplier 0.5 → status "half"', () => {
    assert.equal(bonusStatus(0.5), 'half')
  })
  test('multiplier 0 → status "suspended"', () => {
    assert.equal(bonusStatus(0), 'suspended')
  })
})

describe('Completion percentage', () => {
  test('3 of 4 tasks → 75%', () => {
    assert.equal(completionPct(3, 4), 75)
  })
  test('4 of 4 tasks → 100%', () => {
    assert.equal(completionPct(4, 4), 100)
  })
  test('0 of 0 tasks → 0% (no divide by zero)', () => {
    assert.equal(completionPct(0, 0), 0)
  })
  test('rounds correctly: 1 of 3 → 33%', () => {
    assert.equal(completionPct(1, 3), 33)
  })
})

describe('Simulator calculations', () => {
  test('S2 defaults: 10 agents × 4 missions × $499 avg', () => {
    const r = simulate({ supervisees: 10, missions_month: 4, avg_fee_usd: 499, supervisee_tier: 'S1', tier: 'S2' })
    assert.equal(r.n, 10)
    assert.equal(r.totalMiss, 40)
    assert.equal(r.gross, 19960)
    // commissions = round(19960 × 0.10) = 1996
    assert.equal(r.commissions, 1996)
    assert.equal(r.netBE, 19960 - 1996)
    // bonus = round(17964 × 0.05) = 898
    assert.equal(r.bonus, Math.round(17964 * 0.05))
  })

  test('S3 caps supervisees at 5', () => {
    const r = simulate({ supervisees: 8, missions_month: 4, avg_fee_usd: 500, supervisee_tier: 'S2', tier: 'S3' })
    // 8 exceeds S3 max → capped at 5
    assert.equal(r.n, 5)
    assert.equal(r.totalMiss, 20)
  })

  test('S2 does not cap below max', () => {
    const r = simulate({ supervisees: 5, missions_month: 3, avg_fee_usd: 400, supervisee_tier: 'S1', tier: 'S2' })
    assert.equal(r.n, 5)
  })

  test('annual bonus is 12 × monthly', () => {
    const r = simulate({ supervisees: 4, missions_month: 2, avg_fee_usd: 300, supervisee_tier: 'S1', tier: 'S2' })
    assert.equal(r.annual, r.bonus * 12)
  })

  test('S2 supervisee commission rate is 15%', () => {
    const r = simulate({ supervisees: 1, missions_month: 1, avg_fee_usd: 1000, supervisee_tier: 'S2', tier: 'S3' })
    assert.equal(r.commissions, 150)  // round(1000 × 0.15)
    assert.equal(r.netBE, 850)
  })
})

describe('Org tree totals', () => {
  test('empty org tree has 0 S2s and 0 S1s', () => {
    const totals = orgTotals([])
    assert.equal(totals.total_s2s, 0)
    assert.equal(totals.total_s1s, 0)
  })

  test('2 S2s with 3 S1s each → total_s1s = 6', () => {
    const s2s = [
      { id: 1, s1s: [{ id: 10 }, { id: 11 }, { id: 12 }] },
      { id: 2, s1s: [{ id: 20 }, { id: 21 }, { id: 22 }] },
    ]
    const totals = orgTotals(s2s)
    assert.equal(totals.total_s2s, 2)
    assert.equal(totals.total_s1s, 6)
  })

  test('S2 with no S1s still counts toward S2 total', () => {
    const s2s = [{ id: 1, s1s: [] }, { id: 2, s1s: [{ id: 10 }] }]
    const totals = orgTotals(s2s)
    assert.equal(totals.total_s2s, 2)
    assert.equal(totals.total_s1s, 1)
  })
})

describe('Bonus history — total paid', () => {
  const history = [
    { id: 1, status: 'paid',      final_bonus_cents: 5000 },
    { id: 2, status: 'paid',      final_bonus_cents: 7500 },
    { id: 3, status: 'validated', final_bonus_cents: 3000 },
    { id: 4, status: 'draft',     final_bonus_cents: 2000 },
  ]

  test('only paid records are summed', () => {
    assert.equal(totalPaidCents(history), 12500)
  })

  test('empty history → 0 paid', () => {
    assert.equal(totalPaidCents([]), 0)
  })

  test('no paid records → 0', () => {
    const unpaid = history.filter(r => r.status !== 'paid')
    assert.equal(totalPaidCents(unpaid), 0)
  })

  test('null final_bonus_cents is treated as 0', () => {
    const h = [{ status: 'paid', final_bonus_cents: null }]
    assert.equal(totalPaidCents(h), 0)
  })
})

describe('Admin bonus statement summary', () => {
  const statements = [
    { status: 'draft',     final_bonus_cents: 1000 },
    { status: 'draft',     final_bonus_cents: 2000 },
    { status: 'validated', final_bonus_cents: 5000 },
    { status: 'paid',      final_bonus_cents: 8000 },
  ]

  test('total_draft_usd sums only draft statements', () => {
    const s = bonusSummary(statements)
    assert.equal(s.total_draft_usd, '30.00')
  })

  test('total_validated_usd sums only validated statements', () => {
    const s = bonusSummary(statements)
    assert.equal(s.total_validated_usd, '50.00')
  })

  test('count includes all statements', () => {
    const s = bonusSummary(statements)
    assert.equal(s.count, 4)
  })

  test('empty statements → all zeros', () => {
    const s = bonusSummary([])
    assert.equal(s.total_draft_usd, '0.00')
    assert.equal(s.total_validated_usd, '0.00')
    assert.equal(s.count, 0)
  })
})

describe('Tier upgrade logic', () => {
  test('S1 upgrades to S2', () => {
    assert.equal(nextTier('S1'), 'S2')
  })
  test('S2 upgrades to S3', () => {
    assert.equal(nextTier('S2'), 'S3')
  })
  test('S3 cannot upgrade further (returns null)', () => {
    assert.equal(nextTier('S3'), null)
  })

  test('S1→S2 requires 5 missions', () => {
    assert.equal(MIN_MISSIONS.S2, 5)
  })
  test('S2→S3 requires 10 missions', () => {
    assert.equal(MIN_MISSIONS.S3, 10)
  })

  test('S1 with 5 missions meets S2 requirement', () => {
    assert.ok(meetsUpgradeMissions('S1', 5))
  })
  test('S1 with 4 missions does not meet S2 requirement', () => {
    assert.ok(!meetsUpgradeMissions('S1', 4))
  })
  test('S2 with 10 missions meets S3 requirement', () => {
    assert.ok(meetsUpgradeMissions('S2', 10))
  })
  test('S2 with 9 missions does not meet S3 requirement', () => {
    assert.ok(!meetsUpgradeMissions('S2', 9))
  })
  test('S3 cannot upgrade regardless of missions', () => {
    assert.ok(!meetsUpgradeMissions('S3', 999))
  })
})

describe('Admin bonus pay guard', () => {
  test('accepts valid payment reference', () => {
    const r = paymentReferenceGuard('SWIFT-TEST-REF-2026')
    assert.ok(r.ok)
  })
  test('rejects missing payment reference', () => {
    const r = paymentReferenceGuard(undefined)
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })
  test('rejects null payment reference', () => {
    const r = paymentReferenceGuard(null)
    assert.equal(r.ok, false)
  })
  test('rejects empty string payment reference', () => {
    // empty string is falsy → rejected
    const r = paymentReferenceGuard('')
    assert.equal(r.ok, false)
  })
})
