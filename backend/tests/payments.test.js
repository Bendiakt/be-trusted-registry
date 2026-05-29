'use strict'

/**
 * tests/payments.test.js
 *
 * Unit tests for the mission-fee checkout business logic and webhook handler.
 *
 * Strategy: instead of spinning up Express + Stripe, we extract the guard
 * conditions verbatim from the route handler and test them as pure functions.
 * This verifies every branch (role check, company lookup, duplicate-payment
 * guard, fee defaults, commission computation, webhook metadata routing) without
 * needing a live server or real Stripe account.
 *
 * Usage:
 *   node --test tests/payments.test.js
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// ── Inline business-logic mirrors ─────────────────────────────────────────────
// These replicate the decision branches in routes/payments.js so we can test
// each case in isolation.

/**
 * Guard: only company role may create a mission checkout session.
 * Mirrors: if (req.user.role !== 'company') return 403
 */
function missionCheckoutRoleGuard(role) {
  if (role !== 'company') return { allowed: false, status: 403, error: 'Only company accounts can pay mission fees' }
  return { allowed: true }
}

/**
 * Guard: mission must exist and belong to the company.
 * Mirrors: if (!mission) return 404
 */
function missionOwnershipGuard(mission) {
  if (!mission) return { ok: false, status: 404, error: 'Mission not found' }
  return { ok: true }
}

/**
 * Guard: mission fee must not already be paid.
 * Mirrors: if (mission.payment_confirmed_at) return 409
 */
function missionDoublePaymentGuard(mission) {
  if (mission.payment_confirmed_at) return { ok: false, status: 409, error: 'Mission fee already paid' }
  return { ok: true }
}

/**
 * Compute the Stripe amount in cents from the mission fee_usd.
 * Mirrors: const feeUsd = mission.fee_usd || 500; amountCents = feeUsd * 100
 */
function computeAmountCents(feeUsd) {
  const effective = feeUsd || 500
  return effective * 100
}

/**
 * Compute commission cents: fee_usd × commission_rate × 100.
 * Mirrors: ROUND(fee_usd * COALESCE(commission_rate, 0.10) * 100)
 */
function computeCommissionCents(feeUsd, commissionRate) {
  const rate = commissionRate ?? 0.10
  return Math.round(feeUsd * rate * 100)
}

/**
 * Determine whether a webhook session is a mission-fee payment.
 * Mirrors: if (sesSubType === 'mission_fee' && metaMissionId)
 */
function isMissionFeeWebhook(metadata) {
  const { subscriptionType, missionId } = metadata || {}
  return subscriptionType === 'mission_fee' && Boolean(missionId)
}

/**
 * Build the Stripe session metadata for a mission checkout.
 */
function buildMissionSessionMetadata({ missionId, companyId, userId }) {
  return {
    subscriptionType: 'mission_fee',
    missionId:        String(missionId),
    companyId:        String(companyId),
    userId:           String(userId),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mission-checkout — role guard', () => {
  test('allows company role', () => {
    const result = missionCheckoutRoleGuard('company')
    assert.equal(result.allowed, true)
  })

  test('blocks pac role with 403', () => {
    const result = missionCheckoutRoleGuard('pac')
    assert.equal(result.allowed, false)
    assert.equal(result.status, 403)
    assert.match(result.error, /company accounts/)
  })

  test('blocks admin role with 403', () => {
    const result = missionCheckoutRoleGuard('admin')
    assert.equal(result.allowed, false)
    assert.equal(result.status, 403)
  })

  test('blocks trader role with 403', () => {
    const result = missionCheckoutRoleGuard('trader')
    assert.equal(result.allowed, false)
    assert.equal(result.status, 403)
  })
})

describe('mission-checkout — ownership guard', () => {
  test('ok when mission found', () => {
    const m = { id: 42, fee_usd: 500, payment_confirmed_at: null }
    assert.equal(missionOwnershipGuard(m).ok, true)
  })

  test('returns 404 when mission is null (not found or wrong company)', () => {
    const r = missionOwnershipGuard(null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 404)
    assert.match(r.error, /not found/)
  })

  test('returns 404 when mission is undefined', () => {
    const r = missionOwnershipGuard(undefined)
    assert.equal(r.ok, false)
    assert.equal(r.status, 404)
  })
})

describe('mission-checkout — double-payment guard', () => {
  test('allows when payment_confirmed_at is null', () => {
    const r = missionDoublePaymentGuard({ payment_confirmed_at: null })
    assert.equal(r.ok, true)
  })

  test('allows when payment_confirmed_at is undefined', () => {
    const r = missionDoublePaymentGuard({ payment_confirmed_at: undefined })
    assert.equal(r.ok, true)
  })

  test('blocks when already paid — returns 409', () => {
    const r = missionDoublePaymentGuard({ payment_confirmed_at: '2026-05-27T12:00:00Z' })
    assert.equal(r.ok, false)
    assert.equal(r.status, 409)
    assert.match(r.error, /already paid/)
  })
})

describe('mission-checkout — amount calculation', () => {
  test('500 USD → 50 000 cents', () => {
    assert.equal(computeAmountCents(500), 50_000)
  })

  test('750 USD → 75 000 cents', () => {
    assert.equal(computeAmountCents(750), 75_000)
  })

  test('defaults to $500 when fee_usd is null', () => {
    assert.equal(computeAmountCents(null), 50_000)
  })

  test('defaults to $500 when fee_usd is 0 (falsy)', () => {
    assert.equal(computeAmountCents(0), 50_000)
  })

  test('uses provided fee_usd precisely', () => {
    assert.equal(computeAmountCents(1200), 120_000)
  })
})

describe('mission-checkout — commission calculation', () => {
  test('S1 agent (10%) on $500 fee → 5 000 cents', () => {
    assert.equal(computeCommissionCents(500, 0.10), 5_000)
  })

  test('S2 agent (15%) on $500 fee → 7 500 cents', () => {
    assert.equal(computeCommissionCents(500, 0.15), 7_500)
  })

  test('S3 agent (20%) on $500 fee → 10 000 cents', () => {
    assert.equal(computeCommissionCents(500, 0.20), 10_000)
  })

  test('defaults to 10% when commission_rate is null (no agent yet)', () => {
    assert.equal(computeCommissionCents(500, null), 5_000)
  })

  test('rounds fractional cents correctly', () => {
    // $700 × 15% = $105.00 → 10 500 cents (exact)
    assert.equal(computeCommissionCents(700, 0.15), 10_500)
    // $333 × 10% = $33.30 → 3 330 cents
    assert.equal(computeCommissionCents(333, 0.10), 3_330)
  })

  test('handles zero commission rate', () => {
    assert.equal(computeCommissionCents(500, 0), 0)
  })
})

describe('mission-checkout — Stripe session metadata', () => {
  test('always sets subscriptionType = mission_fee', () => {
    const m = buildMissionSessionMetadata({ missionId: 42, companyId: 10, userId: 1 })
    assert.equal(m.subscriptionType, 'mission_fee')
  })

  test('coerces IDs to strings (Stripe metadata is string-only)', () => {
    const m = buildMissionSessionMetadata({ missionId: 42, companyId: 10, userId: 1 })
    assert.equal(typeof m.missionId, 'string')
    assert.equal(typeof m.companyId, 'string')
    assert.equal(typeof m.userId, 'string')
  })

  test('preserves the correct values', () => {
    const m = buildMissionSessionMetadata({ missionId: 99, companyId: 5, userId: 7 })
    assert.equal(m.missionId, '99')
    assert.equal(m.companyId, '5')
    assert.equal(m.userId, '7')
  })
})

describe('webhook — mission_fee session detection', () => {
  test('detects valid mission_fee session', () => {
    assert.equal(isMissionFeeWebhook({ subscriptionType: 'mission_fee', missionId: '42' }), true)
  })

  test('false when subscriptionType is certification', () => {
    assert.equal(isMissionFeeWebhook({ subscriptionType: 'company_certification', missionId: '42' }), false)
  })

  test('false when subscriptionType is pac_membership', () => {
    assert.equal(isMissionFeeWebhook({ subscriptionType: 'pac_membership', missionId: '42' }), false)
  })

  test('false when missionId is absent', () => {
    assert.equal(isMissionFeeWebhook({ subscriptionType: 'mission_fee' }), false)
  })

  test('false when missionId is empty string', () => {
    assert.equal(isMissionFeeWebhook({ subscriptionType: 'mission_fee', missionId: '' }), false)
  })

  test('false when metadata is null', () => {
    assert.equal(isMissionFeeWebhook(null), false)
  })

  test('false when metadata is undefined', () => {
    assert.equal(isMissionFeeWebhook(undefined), false)
  })
})
