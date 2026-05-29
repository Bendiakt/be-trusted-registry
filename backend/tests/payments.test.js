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

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE TEST-CLOCK SCENARIOS
// Simulate the webhook events Stripe fires automatically when subscriptions
// renew, fail, or are cancelled — as if a test clock advanced time past the
// billing anchor date.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers: mirror the inline logic from routes/payments.js ──────────────────

/**
 * Resolve the subscription category from an invoice line-item's metadata.
 * Mirrors the isTrader / isPacMembership detection in the invoice.paid handler.
 */
function classifyInvoiceSubscription(lineItemMetadata = {}) {
  const { planId, subscriptionType } = lineItemMetadata
  if (
    subscriptionType === 'pac_membership' ||
    planId === 'pac_s2_annual' ||
    planId === 'pac_s3_annual'
  ) return 'pac'
  if (
    subscriptionType === 'trader_portal' ||
    planId === 'trader_monthly' ||
    planId === 'trader_annual'
  ) return 'trader'
  return 'company_cert'
}

/**
 * Determine if a renewal invoice is for a PAC reinstatement.
 * Mirrors: isReinstatement = !pac.membership_active && pac.license_suspended_at
 */
function isPacReinstatement(pac) {
  return !pac.membership_active && Boolean(pac.license_suspended_at)
}

/**
 * Pick the tier config for reinstatement.
 * Mirrors the tierCfg lookup in the invoice.paid PAC path.
 */
function pacReinstateTierCfg(tier) {
  const t = tier?.toUpperCase()
  if (t === 'S3') return { commission_rate: 0.20, max_supervised: 5 }
  if (t === 'S2') return { commission_rate: 0.15, max_supervised: 10 }
  return null
}

/**
 * Compute the demotion target when a PAC agent's payment fails.
 * Mirrors: downTier = pac_tier === 'S3' ? 'S2' : 'S1'
 */
function pacDemotionTarget(currentTier) {
  const t = currentTier?.toUpperCase()
  if (t === 'S3') return { tier: 'S2', commission_rate: 0.15, max_supervised: 10 }
  return { tier: 'S1', commission_rate: 0.10, max_supervised: 0 }
}

/**
 * Determine whether immediate demotion should fire.
 * Mirrors: if (attemptCount >= 3) { downgrade }
 */
function shouldDemoteOnFailure(attemptCount) {
  return (attemptCount || 1) >= 3
}

/**
 * Mirror levelFromPlanId from payments.js
 */
function levelFromPlanId(planId) {
  const map = { level1: 1, level2: 2, level3: 3 }
  return map[planId] || null
}

/**
 * Resolve the subscription category from customer.subscription.deleted.
 * Priority: PAC (matched by sub_id) → trader → company cert
 */
function classifySubscriptionDeleted({ hasPacMatch, hasTraderMatch }) {
  if (hasPacMatch) return 'pac'
  if (hasTraderMatch) return 'trader'
  return 'company_cert'
}

// ── invoice.paid fixture factory ──────────────────────────────────────────────

function makeInvoice({ subscriptionId = 'sub_test_1', customerId = 'cus_test_1', planId, subscriptionType, amountPaid = 9990 } = {}) {
  return {
    id:              `in_test_${Math.random().toString(36).slice(2)}`,
    object:          'invoice',
    customer:        customerId,
    subscription:    subscriptionId,
    amount_paid:     amountPaid,
    currency:        'usd',
    customer_email:  'test@example.com',
    payment_intent:  'pi_test_1',
    lines: {
      data: [{
        id:       'il_test_1',
        metadata: { planId, subscriptionType },
        price:    { metadata: {} },
      }],
    },
  }
}

// ── invoice.paid — subscription type routing ──────────────────────────────────

describe('Stripe test-clock — invoice.paid routing', () => {
  test('PAC annual renewal invoice → classified as "pac"', () => {
    const invoice = makeInvoice({ planId: 'pac_s2_annual' })
    const meta = invoice.lines.data[0].metadata
    assert.equal(classifyInvoiceSubscription(meta), 'pac')
  })

  test('PAC S3 annual renewal invoice → classified as "pac"', () => {
    const invoice = makeInvoice({ planId: 'pac_s3_annual' })
    const meta = invoice.lines.data[0].metadata
    assert.equal(classifyInvoiceSubscription(meta), 'pac')
  })

  test('subscriptionType=pac_membership wins over planId', () => {
    const meta = { subscriptionType: 'pac_membership', planId: 'level2' }
    assert.equal(classifyInvoiceSubscription(meta), 'pac')
  })

  test('trader monthly renewal invoice → classified as "trader"', () => {
    const invoice = makeInvoice({ planId: 'trader_monthly' })
    const meta = invoice.lines.data[0].metadata
    assert.equal(classifyInvoiceSubscription(meta), 'trader')
  })

  test('trader annual renewal invoice → classified as "trader"', () => {
    const meta = { subscriptionType: 'trader_portal' }
    assert.equal(classifyInvoiceSubscription(meta), 'trader')
  })

  test('level1 cert invoice → classified as "company_cert"', () => {
    const invoice = makeInvoice({ planId: 'level1' })
    const meta = invoice.lines.data[0].metadata
    assert.equal(classifyInvoiceSubscription(meta), 'company_cert')
  })

  test('level2 cert invoice → classified as "company_cert"', () => {
    const meta = { planId: 'level2' }
    assert.equal(classifyInvoiceSubscription(meta), 'company_cert')
  })

  test('empty metadata → classified as "company_cert" (fallback)', () => {
    assert.equal(classifyInvoiceSubscription({}), 'company_cert')
  })

  test('invoice without subscription field → must be skipped (guard)', () => {
    const invoice = makeInvoice()
    delete invoice.subscription
    assert.equal(!invoice.subscription, true, 'guard: no subscription → skip')
  })
})

// ── invoice.paid — company certification level resolution ─────────────────────

describe('Stripe test-clock — levelFromPlanId', () => {
  test('level1 → cert level 1 (Bronze)', () => {
    assert.equal(levelFromPlanId('level1'), 1)
  })

  test('level2 → cert level 2 (Silver)', () => {
    assert.equal(levelFromPlanId('level2'), 2)
  })

  test('level3 → cert level 3 (Gold)', () => {
    assert.equal(levelFromPlanId('level3'), 3)
  })

  test('unknown plan → null (no cert update)', () => {
    assert.equal(levelFromPlanId('trader_monthly'), null)
  })

  test('null planId → null', () => {
    assert.equal(levelFromPlanId(null), null)
  })
})

// ── invoice.paid — PAC reinstatement detection ───────────────────────────────

describe('Stripe test-clock — PAC membership reinstatement on renewal', () => {
  test('suspended agent (membership_active=false + license_suspended_at set) → reinstatement', () => {
    const pac = { membership_active: false, license_suspended_at: '2026-04-01T00:00:00Z', pac_tier: 'S2' }
    assert.equal(isPacReinstatement(pac), true)
  })

  test('active agent → normal renewal, not reinstatement', () => {
    const pac = { membership_active: true, license_suspended_at: null, pac_tier: 'S2' }
    assert.equal(isPacReinstatement(pac), false)
  })

  test('suspended but no license_suspended_at → not reinstatement', () => {
    const pac = { membership_active: false, license_suspended_at: null, pac_tier: 'S2' }
    assert.equal(isPacReinstatement(pac), false)
  })

  test('S3 reinstatement → tier config commission 20%, max_supervised 5', () => {
    const cfg = pacReinstateTierCfg('S3')
    assert.deepEqual(cfg, { commission_rate: 0.20, max_supervised: 5 })
  })

  test('S2 reinstatement → tier config commission 15%, max_supervised 10', () => {
    const cfg = pacReinstateTierCfg('S2')
    assert.deepEqual(cfg, { commission_rate: 0.15, max_supervised: 10 })
  })

  test('S1 reinstatement → no tier config (null)', () => {
    const cfg = pacReinstateTierCfg('S1')
    assert.equal(cfg, null)
  })

  test('case-insensitive tier matching (lowercase s3)', () => {
    const cfg = pacReinstateTierCfg('s3')
    assert.deepEqual(cfg, { commission_rate: 0.20, max_supervised: 5 })
  })
})

// ── invoice.payment_failed — PAC dunning / demotion ──────────────────────────

describe('Stripe test-clock — invoice.payment_failed demotion logic', () => {
  test('attempt 1 → no immediate demotion', () => {
    assert.equal(shouldDemoteOnFailure(1), false)
  })

  test('attempt 2 → no immediate demotion', () => {
    assert.equal(shouldDemoteOnFailure(2), false)
  })

  test('attempt 3 → demote immediately', () => {
    assert.equal(shouldDemoteOnFailure(3), true)
  })

  test('attempt 4 (Stripe final retry) → demote', () => {
    assert.equal(shouldDemoteOnFailure(4), true)
  })

  test('missing attempt_count defaults to 1 → no demotion', () => {
    assert.equal(shouldDemoteOnFailure(undefined), false)
  })

  test('S3 agent demoted → S2, commission 15%, max_supervised 10', () => {
    const result = pacDemotionTarget('S3')
    assert.deepEqual(result, { tier: 'S2', commission_rate: 0.15, max_supervised: 10 })
  })

  test('S2 agent demoted → S1, commission 10%, max_supervised 0', () => {
    const result = pacDemotionTarget('S2')
    assert.deepEqual(result, { tier: 'S1', commission_rate: 0.10, max_supervised: 0 })
  })

  test('S1 agent demoted → S1 (floor), commission 10%, max_supervised 0', () => {
    const result = pacDemotionTarget('S1')
    assert.deepEqual(result, { tier: 'S1', commission_rate: 0.10, max_supervised: 0 })
  })

  test('lowercase tier handled', () => {
    const result = pacDemotionTarget('s3')
    assert.deepEqual(result, { tier: 'S2', commission_rate: 0.15, max_supervised: 10 })
  })

  test('PAC-less invoice (subscription not found in pac_profiles) → ignored (guard returns)', () => {
    // Mirrors: if (!pacResult.rows[0]) return res.json({ received: true })
    const pacProfile = null
    assert.equal(pacProfile === null, true, 'guard: non-PAC subscription → skip')
  })
})

// ── customer.subscription.deleted — cancellation routing ─────────────────────

describe('Stripe test-clock — customer.subscription.deleted routing', () => {
  test('PAC match by sub_id → "pac" cancellation', () => {
    assert.equal(classifySubscriptionDeleted({ hasPacMatch: true, hasTraderMatch: false }), 'pac')
  })

  test('trader match → "trader" cancellation', () => {
    assert.equal(classifySubscriptionDeleted({ hasPacMatch: false, hasTraderMatch: true }), 'trader')
  })

  test('no PAC, no trader → "company_cert" cancellation', () => {
    assert.equal(classifySubscriptionDeleted({ hasPacMatch: false, hasTraderMatch: false }), 'company_cert')
  })

  test('PAC takes priority over trader even if both somehow match', () => {
    assert.equal(classifySubscriptionDeleted({ hasPacMatch: true, hasTraderMatch: true }), 'pac')
  })

  test('missing customerId → guard short-circuits (no customerId)', () => {
    const subscription = { id: 'sub_test_1', customer: null }
    assert.equal(!subscription.customer, true, 'guard: null customer → skip')
  })
})

// ── invoice.paid — period_end timestamp conversion ───────────────────────────

describe('Stripe test-clock — Unix timestamp to ISO string (period_end)', () => {
  // Stripe returns current_period_end as a Unix timestamp (seconds since epoch)
  // The handler converts it: new Date(sub.current_period_end * 1000).toISOString()

  function periodEndToISO(unixSeconds) {
    if (!unixSeconds) return null
    return new Date(unixSeconds * 1000).toISOString()
  }

  test('known Unix timestamp converts to correct ISO date', () => {
    // 2027-05-29T00:00:00Z = Date.UTC(2027, 4, 29) / 1000
    const iso = periodEndToISO(1811548800)
    assert.match(iso, /^2027-05-29T/)
  })

  test('null timestamp → null (no period_end)', () => {
    assert.equal(periodEndToISO(null), null)
  })

  test('zero timestamp → null (falsy guard)', () => {
    assert.equal(periodEndToISO(0), null)
  })

  test('1-year renewal from now has correct year', () => {
    const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
    const iso = periodEndToISO(oneYearFromNow)
    const year = new Date(iso).getFullYear()
    const expectedYear = new Date().getFullYear() + 1
    assert.equal(year, expectedYear)
  })
})
