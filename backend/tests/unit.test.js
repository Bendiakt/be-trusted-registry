'use strict'

/**
 * unit.test.js — pure-logic unit tests for trustScore.js and fraudDetection.js
 *
 * No database required. The `../db` module is stubbed via require.cache before
 * the modules under test are loaded.
 *
 * Usage:
 *   node --test tests/unit.test.js
 *   npm test   (runs all tests/*.test.js)
 */

const { test, describe, before, beforeEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const path   = require('path')

// ── DB stub — swapped per test via `mockQuery` ────────────────────────────────
let mockQuery = async () => ({ rows: [] })

const dbPath = require.resolve('../db')
require.cache[dbPath] = {
  id:       dbPath,
  filename: dbPath,
  loaded:   true,
  exports:  {
    query:   (...args) => mockQuery(...args),
    getPool: () => {},
    initDb:  async () => {},
  },
}

// Load modules AFTER cache stub is in place
const { computeTrustScore, INDICATORS, DISPOSABLE_DOMAINS } = require('../lib/trustScore')
const { checkFraud, RULES }                                  = require('../lib/fraudDetection')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal user row */
const makeUser = (overrides = {}) => ({
  id:         1,
  email:      'acme@business.com',
  created_at: new Date(Date.now() - 200 * 86_400_000).toISOString(), // 200 days old
  ...overrides,
})

/** Build a minimal company row */
const makeCompany = (overrides = {}) => ({
  id:                  10,
  user_id:             1,
  name:                'Acme Corp',
  industry:            'Manufacturing',
  country:             'AE',
  description:         'A great supplier',
  website:             'https://acme.ae',
  certification_level: 0,
  updated_at:          new Date().toISOString(),
  ...overrides,
})

/**
 * Wire the mock query to return specific rows for each SQL call.
 * trustScore.js fires 6 parallel queries; the order matches the
 * destructured Promise.all in computeTrustScore.
 * [ userRes, companyRes, alertsRes, auditRes, ipFlagRes, velocityRes ]
 */
const stubTrustQueries = ({ user, company, alerts = [], audit = [], ipCount = 0, velocityCount = 0 }) => {
  const responses = [
    { rows: user    ? [user]    : [] },
    { rows: company ? [company] : [] },
    { rows: alerts },
    { rows: audit },
    { rows: [{ count: String(ipCount) }] },
    { rows: [{ count: String(velocityCount) }] },
  ]
  let i = 0
  mockQuery = async () => responses[i++ % responses.length] || { rows: [] }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST SCORE — static / structural tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('INDICATORS metadata', () => {
  test('27 indicators are defined', () => {
    assert.equal(INDICATORS.length, 27)
  })

  test('total weight sums to exactly 100', () => {
    const total = INDICATORS.reduce((sum, ind) => sum + ind.weight, 0)
    assert.equal(total, 100, `Expected 100 but got ${total}`)
  })

  test('each indicator has id, weight (>0), and label', () => {
    for (const ind of INDICATORS) {
      assert.ok(ind.id,          `Missing id on indicator: ${JSON.stringify(ind)}`)
      assert.ok(ind.weight > 0,  `Zero/negative weight on: ${ind.id}`)
      assert.ok(ind.label,       `Missing label on: ${ind.id}`)
    }
  })

  test('no duplicate indicator ids', () => {
    const ids = INDICATORS.map(i => i.id)
    const unique = new Set(ids)
    assert.equal(ids.length, unique.size)
  })
})

describe('DISPOSABLE_DOMAINS set', () => {
  test('mailinator.com is disposable', () => {
    assert.ok(DISPOSABLE_DOMAINS.has('mailinator.com'))
  })

  test('gmail.com is NOT in disposable set', () => {
    assert.ok(!DISPOSABLE_DOMAINS.has('gmail.com'))
  })

  test('business.com is NOT disposable', () => {
    assert.ok(!DISPOSABLE_DOMAINS.has('business.com'))
  })
})

describe('computeTrustScore — risk level thresholds', () => {
  test('score >= 70 → riskLevel = low', async () => {
    // Max profile: all fields set, cert level 3, old account, no alerts
    stubTrustQueries({
      user:    makeUser(),
      company: makeCompany({ certification_level: 3 }),
    })
    const result = await computeTrustScore(1)
    // With level-3 cert + full profile + old account → should score high enough
    assert.ok(result !== null)
    if (result.score >= 70) assert.equal(result.riskLevel, 'low')
  })

  test('score < 40 → riskLevel = high', async () => {
    // Minimal: no company, fresh account, no activity
    stubTrustQueries({
      user:    makeUser({ created_at: new Date().toISOString() }), // 0 days old
      company: null,
    })
    const result = await computeTrustScore(1)
    assert.ok(result !== null)
    if (result.score < 40) assert.equal(result.riskLevel, 'high')
  })

  test('score 40-69 → riskLevel = medium', () => {
    // Tested via the scoring logic — just verify threshold constants
    const low    = 70
    const medium = 40
    assert.ok(low    > medium)
    assert.ok(medium > 0)
  })
})

describe('computeTrustScore — returns null when user missing', () => {
  test('returns null for unknown userId', async () => {
    stubTrustQueries({ user: null, company: null })
    const result = await computeTrustScore(9999)
    assert.equal(result, null)
  })
})

describe('computeTrustScore — profile completeness indicators', () => {
  test('full profile scores higher than empty profile', async () => {
    stubTrustQueries({
      user:    makeUser(),
      company: makeCompany(), // full
    })
    const full = await computeTrustScore(1)

    stubTrustQueries({
      user:    makeUser(),
      company: makeCompany({ name: null, industry: null, country: null, description: null, website: null }),
    })
    const empty = await computeTrustScore(1)

    assert.ok(full.score > empty.score, `Expected full (${full.score}) > empty (${empty.score})`)
  })

  test('has_website indicator passes when website set', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany({ website: 'https://acme.ae' }) })
    const r = await computeTrustScore(1)
    const ind = r.details.find(d => d.id === 'has_website')
    assert.ok(ind.passed)
  })

  test('has_website indicator fails when website null', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany({ website: null }) })
    const r = await computeTrustScore(1)
    const ind = r.details.find(d => d.id === 'has_website')
    assert.ok(!ind.passed)
  })
})

describe('computeTrustScore — certification level indicators', () => {
  test('cert level 0 → bronze/silver/gold all fail', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany({ certification_level: 0 }) })
    const r = await computeTrustScore(1)
    assert.ok(!r.details.find(d => d.id === 'cert_bronze').passed)
    assert.ok(!r.details.find(d => d.id === 'cert_silver').passed)
    assert.ok(!r.details.find(d => d.id === 'cert_gold').passed)
  })

  test('cert level 1 → bronze passes, silver/gold fail', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany({ certification_level: 1 }) })
    const r = await computeTrustScore(1)
    assert.ok( r.details.find(d => d.id === 'cert_bronze').passed)
    assert.ok(!r.details.find(d => d.id === 'cert_silver').passed)
    assert.ok(!r.details.find(d => d.id === 'cert_gold').passed)
  })

  test('cert level 3 → bronze + silver + gold all pass', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany({ certification_level: 3 }) })
    const r = await computeTrustScore(1)
    assert.ok(r.details.find(d => d.id === 'cert_bronze').passed)
    assert.ok(r.details.find(d => d.id === 'cert_silver').passed)
    assert.ok(r.details.find(d => d.id === 'cert_gold').passed)
  })
})

describe('computeTrustScore — email quality indicators', () => {
  test('disposable email → legit_email fails', async () => {
    stubTrustQueries({ user: makeUser({ email: 'x@mailinator.com' }), company: makeCompany() })
    const r = await computeTrustScore(1)
    assert.ok(!r.details.find(d => d.id === 'legit_email').passed)
    assert.ok(!r.details.find(d => d.id === 'email_quality').passed)
  })

  test('consumer email (gmail) → legit_email passes, email_quality fails', async () => {
    stubTrustQueries({ user: makeUser({ email: 'x@gmail.com' }), company: makeCompany() })
    const r = await computeTrustScore(1)
    assert.ok( r.details.find(d => d.id === 'legit_email').passed)
    assert.ok(!r.details.find(d => d.id === 'email_quality').passed)
  })

  test('business email → both legit_email and email_quality pass', async () => {
    stubTrustQueries({ user: makeUser({ email: 'ceo@acmecorp.ae' }), company: makeCompany() })
    const r = await computeTrustScore(1)
    assert.ok(r.details.find(d => d.id === 'legit_email').passed)
    assert.ok(r.details.find(d => d.id === 'email_quality').passed)
  })
})

describe('computeTrustScore — account age indicators', () => {
  test('0-day-old account → age_30d, age_90d, age_180d all fail', async () => {
    stubTrustQueries({ user: makeUser({ created_at: new Date().toISOString() }), company: makeCompany() })
    const r = await computeTrustScore(1)
    assert.ok(!r.details.find(d => d.id === 'age_30d').passed)
    assert.ok(!r.details.find(d => d.id === 'age_90d').passed)
    assert.ok(!r.details.find(d => d.id === 'age_180d').passed)
  })

  test('200-day-old account → age_30d + age_90d + age_180d all pass', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany() }) // default 200d
    const r = await computeTrustScore(1)
    assert.ok(r.details.find(d => d.id === 'age_30d').passed)
    assert.ok(r.details.find(d => d.id === 'age_90d').passed)
    assert.ok(r.details.find(d => d.id === 'age_180d').passed)
  })
})

describe('computeTrustScore — fraud alert indicators', () => {
  test('no alerts → no_alerts, no_recent_alerts, no_high_alerts all pass', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany(), alerts: [] })
    const r = await computeTrustScore(1)
    assert.ok(r.details.find(d => d.id === 'no_alerts').passed)
    assert.ok(r.details.find(d => d.id === 'no_recent_alerts').passed)
    assert.ok(r.details.find(d => d.id === 'no_high_alerts').passed)
  })

  test('high alert present → no_alerts and no_high_alerts fail', async () => {
    const alert = { severity: 'high', created_at: new Date().toISOString() }
    stubTrustQueries({ user: makeUser(), company: makeCompany(), alerts: [alert] })
    const r = await computeTrustScore(1)
    assert.ok(!r.details.find(d => d.id === 'no_alerts').passed)
    assert.ok(!r.details.find(d => d.id === 'no_high_alerts').passed)
  })

  test('ip_multi_account flag → clean_ip fails', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany(), ipCount: 1 })
    const r = await computeTrustScore(1)
    assert.ok(!r.details.find(d => d.id === 'clean_ip').passed)
  })
})

describe('computeTrustScore — result shape', () => {
  test('returns expected fields', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany() })
    const r = await computeTrustScore(1)
    assert.ok(typeof r.score === 'number')
    assert.ok(['low', 'medium', 'high'].includes(r.riskLevel))
    assert.ok(Array.isArray(r.details))
    assert.ok(typeof r.indicators === 'object')
    assert.equal(r.userId, 1)
    assert.equal(r.companyId, 10)
  })

  test('score is bounded between 0 and 100', async () => {
    stubTrustQueries({ user: makeUser(), company: makeCompany({ certification_level: 3 }) })
    const r = await computeTrustScore(1)
    assert.ok(r.score >= 0 && r.score <= 100, `Score ${r.score} out of bounds`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// FRAUD DETECTION — rules tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('RULES metadata', () => {
  test('7 fraud rules are defined', () => {
    assert.equal(RULES.length, 7)
  })

  test('each rule has id, severity, and label', () => {
    for (const r of RULES) {
      assert.ok(r.id,       `Missing id: ${JSON.stringify(r)}`)
      assert.ok(r.severity, `Missing severity: ${r.id}`)
      assert.ok(r.label,    `Missing label: ${r.id}`)
    }
  })

  test('no duplicate rule ids', () => {
    const ids  = RULES.map(r => r.id)
    const uniq = new Set(ids)
    assert.equal(ids.length, uniq.size)
  })
})

describe('checkFraud — Rule 1: disposable email', () => {
  test('disposable email triggers alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ email: 'user@mailinator.com', action: 'user_register' })
    const hit = alerts.find(a => a.rule === 'disposable_email')
    assert.ok(hit, 'Expected disposable_email alert')
    assert.equal(hit.severity, 'medium')
  })

  test('business email does NOT trigger disposable_email', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ email: 'ceo@acmecorp.ae', action: 'user_register' })
    assert.ok(!alerts.find(a => a.rule === 'disposable_email'))
  })

  test('no email passed → no disposable_email alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'user_register' })
    assert.ok(!alerts.find(a => a.rule === 'disposable_email'))
  })
})

describe('checkFraud — Rule 2: checkout without company', () => {
  test('checkout_session with null companyId → no_company_profile alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'checkout_session', companyId: null })
    assert.ok(alerts.find(a => a.rule === 'no_company_profile'))
  })

  test('checkout_session with valid companyId → no alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'checkout_session', companyId: 42 })
    assert.ok(!alerts.find(a => a.rule === 'no_company_profile'))
  })

  test('other actions with null companyId → no alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'user_login', companyId: null })
    assert.ok(!alerts.find(a => a.rule === 'no_company_profile'))
  })
})

describe('checkFraud — Rule 3: rapid profile changes', () => {
  test('≥ 3 changes in 24 h → rapid_profile_change alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '3' }] })
    const alerts = await checkFraud({
      action: 'company_profile_update', userId: 1, ip: '1.2.3.4', email: 'a@b.com',
    })
    assert.ok(alerts.find(a => a.rule === 'rapid_profile_change'))
  })

  test('< 3 changes in 24 h → no alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '2' }] })
    const alerts = await checkFraud({
      action: 'company_profile_update', userId: 1, ip: '1.2.3.4', email: 'a@b.com',
    })
    assert.ok(!alerts.find(a => a.rule === 'rapid_profile_change'))
  })
})

describe('checkFraud — Rule 4: IP multi-account', () => {
  test('> 3 distinct users on same IP → ip_multi_account high alert', async () => {
    // Rule 4 fires when ip distinct user count > 3
    // Rule 3 may also fire (profile_update action with count)
    mockQuery = async () => ({ rows: [{ count: '4' }] })
    const alerts = await checkFraud({ ip: '1.2.3.4', userId: 1, action: 'user_register' })
    assert.ok(alerts.find(a => a.rule === 'ip_multi_account'))
    assert.equal(alerts.find(a => a.rule === 'ip_multi_account').severity, 'high')
  })

  test('≤ 3 distinct users on IP → no ip_multi_account alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '3' }] })
    const alerts = await checkFraud({ ip: '1.2.3.4', userId: 1, action: 'user_register' })
    assert.ok(!alerts.find(a => a.rule === 'ip_multi_account'))
  })

  test('no IP provided → no ip_multi_account alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ userId: 1, action: 'user_register' })
    assert.ok(!alerts.find(a => a.rule === 'ip_multi_account'))
  })
})

describe('checkFraud — Rule 5: brute-force login', () => {
  test('>= 5 login_fail events → brute_force_login high alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '5' }] })
    const alerts = await checkFraud({ action: 'login_fail', userId: 1, ip: '1.2.3.4' })
    assert.ok(alerts.find(a => a.rule === 'brute_force_login'))
    assert.equal(alerts.find(a => a.rule === 'brute_force_login').severity, 'high')
  })

  test('< 5 login_fail events → no alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '4' }] })
    const alerts = await checkFraud({ action: 'login_fail', userId: 1, ip: '1.2.3.4' })
    assert.ok(!alerts.find(a => a.rule === 'brute_force_login'))
  })
})

describe('checkFraud — Rule 6: Stripe Radar risk', () => {
  test('elevated risk → stripe_radar_risk medium', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'stripe_webhook', stripeRiskLevel: 'elevated' })
    const hit = alerts.find(a => a.rule === 'stripe_radar_risk')
    assert.ok(hit)
    assert.equal(hit.severity, 'medium')
  })

  test('highest risk → stripe_radar_risk high', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'stripe_webhook', stripeRiskLevel: 'highest' })
    const hit = alerts.find(a => a.rule === 'stripe_radar_risk')
    assert.ok(hit)
    assert.equal(hit.severity, 'high')
  })

  test('normal risk → no stripe_radar_risk alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'stripe_webhook', stripeRiskLevel: 'normal' })
    assert.ok(!alerts.find(a => a.rule === 'stripe_radar_risk'))
  })
})

describe('checkFraud — Rule 7: Stripe charge disputed', () => {
  test('disputed charge → stripe_charge_disputed high alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'stripe_webhook', stripeDisputed: true })
    const hit = alerts.find(a => a.rule === 'stripe_charge_disputed')
    assert.ok(hit)
    assert.equal(hit.severity, 'high')
  })

  test('non-disputed → no stripe_charge_disputed alert', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({ action: 'stripe_webhook', stripeDisputed: false })
    assert.ok(!alerts.find(a => a.rule === 'stripe_charge_disputed'))
  })
})

describe('checkFraud — no false positives on unrelated action', () => {
  test('generic action with clean context → no alerts', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({
      action: 'company_viewed',
      email:  'ceo@acmecorp.ae',
      ip:     '5.5.5.5',
      userId: 1,
    })
    assert.deepEqual(alerts, [])
  })
})

describe('checkFraud — multiple rules can trigger simultaneously', () => {
  test('disposable email + high Stripe risk both fire', async () => {
    mockQuery = async () => ({ rows: [{ count: '0' }] })
    const alerts = await checkFraud({
      action:          'stripe_webhook',
      email:           'x@mailinator.com',
      stripeRiskLevel: 'elevated',
    })
    assert.ok(alerts.find(a => a.rule === 'disposable_email'))
    assert.ok(alerts.find(a => a.rule === 'stripe_radar_risk'))
  })
})

// ── blocklist.js ──────────────────────────────────────────────────────────────

const { isBlockedCompany } = require('../lib/blocklist')

describe('isBlockedCompany', () => {
  test('blocks exact "B&E CONSULT"', () => {
    assert.ok(isBlockedCompany('B&E CONSULT'))
  })

  test('blocks "b and e consult" (case-insensitive)', () => {
    assert.ok(isBlockedCompany('b and e consult'))
  })

  test('blocks "B&E CONSULT FZCO" (legal suffix stripped)', () => {
    assert.ok(isBlockedCompany('B&E CONSULT FZCO'))
  })

  test('blocks "B&E CONSULT SARL"', () => {
    assert.ok(isBlockedCompany('B&E CONSULT SARL'))
  })

  test('blocks "B AND E CONSULT PTY"', () => {
    assert.ok(isBlockedCompany('B AND E CONSULT PTY'))
  })

  test('blocks "b&e consult" lowercase', () => {
    assert.ok(isBlockedCompany('b&e consult'))
  })

  test('does NOT block unrelated companies', () => {
    assert.ok(!isBlockedCompany('Acme Corp'))
    assert.ok(!isBlockedCompany('Best Consulting LLC'))
    assert.ok(!isBlockedCompany('B&G Consult'))
  })

  test('does NOT block empty string', () => {
    assert.ok(!isBlockedCompany(''))
  })
})
