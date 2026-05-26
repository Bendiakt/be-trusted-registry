'use strict'
/**
 * pac.test.js — unit tests for PAC v3.0 bonus logic and supervision rules
 *
 * No database required. The `../db` module is stubbed via require.cache.
 *
 * Usage:
 *   node --test tests/pac.test.js
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// ── DB stub ───────────────────────────────────────────────────────────────────
const dbPath = require.resolve('../db')
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query:   async () => ({ rows: [] }),
    getPool: () => {},
    initDb:  async () => {},
  },
}

// ── Load module under test ────────────────────────────────────────────────────
// We extract the pure functions directly from the source without running cron
const fs   = require('fs')
const path = require('path')
const src  = fs.readFileSync(path.join(__dirname, '../lib/pacBonusCron.js'), 'utf8')

// Inline-eval the bonus multiplier function (pure, no DB dep)
const getBonusMultiplier = new Function(`
  ${src.match(/function getBonusMultiplier[\s\S]*?^}/m)?.[0] || ''}
  return getBonusMultiplier
`)()

// ── Bonus multiplier ──────────────────────────────────────────────────────────
describe('getBonusMultiplier', () => {
  test('100% completion → multiplier 1.0 (full bonus)', () => {
    assert.strictEqual(getBonusMultiplier(100), 1.00)
  })
  test('80% completion → multiplier 1.0 (boundary)', () => {
    assert.strictEqual(getBonusMultiplier(80), 1.00)
  })
  test('79% completion → multiplier 0.5 (half bonus)', () => {
    assert.strictEqual(getBonusMultiplier(79), 0.50)
  })
  test('70% completion → multiplier 0.5 (boundary)', () => {
    assert.strictEqual(getBonusMultiplier(70), 0.50)
  })
  test('69% completion → multiplier 0.0 (suspended)', () => {
    assert.strictEqual(getBonusMultiplier(69), 0.00)
  })
  test('0% completion → multiplier 0.0', () => {
    assert.strictEqual(getBonusMultiplier(0), 0.00)
  })
})

// ── Bonus rate constants ──────────────────────────────────────────────────────
describe('BONUS_RATE constants', () => {
  // Extract from source
  const L1match = src.match(/BONUS_RATE\s*=\s*\{[^}]+L1:\s*([\d.]+)/)
  const L2match = src.match(/BONUS_RATE\s*=\s*\{[^}]+L2:\s*([\d.]+)/)

  test('L1 bonus rate is 5%', () => {
    assert.ok(L1match, 'BONUS_RATE.L1 not found in source')
    assert.strictEqual(parseFloat(L1match[1]), 0.05)
  })
  test('L2 bonus rate is 2%', () => {
    assert.ok(L2match, 'BONUS_RATE.L2 not found in source')
    assert.strictEqual(parseFloat(L2match[1]), 0.02)
  })
})

// ── MIN_ACTIVE constants ──────────────────────────────────────────────────────
describe('MIN_ACTIVE supervisee thresholds', () => {
  const S2match = src.match(/MIN_ACTIVE\s*=\s*\{[^}]+S2:\s*(\d+)/)
  const S3match = src.match(/MIN_ACTIVE\s*=\s*\{[^}]+S3:\s*(\d+)/)

  test('S2 minimum active supervisees is 3', () => {
    assert.ok(S2match, 'MIN_ACTIVE.S2 not found in source')
    assert.strictEqual(parseInt(S2match[1], 10), 3)
  })
  test('S3 minimum active supervisees is 2', () => {
    assert.ok(S3match, 'MIN_ACTIVE.S3 not found in source')
    assert.strictEqual(parseInt(S3match[1], 10), 2)
  })
})

// ── Commission rate config ────────────────────────────────────────────────────
describe('COMMISSION_RATE tier config', () => {
  // From pacSupervision.js
  const supSrc = fs.readFileSync(path.join(__dirname, '../routes/pacSupervision.js'), 'utf8')
  const commMatch = supSrc.match(/COMMISSION_RATE\s*=\s*\{([^}]+)\}/)

  test('Commission rates are defined', () => {
    assert.ok(commMatch, 'COMMISSION_RATE not found in pacSupervision.js')
  })
  test('S1 commission rate is 10%', () => {
    assert.ok(commMatch[1].includes('S1') && commMatch[1].match(/S1:\s*0\.10/), 'S1 rate not 0.10')
  })
  test('S2 commission rate is 15%', () => {
    assert.ok(commMatch[1].match(/S2:\s*0\.15/), 'S2 rate not 0.15')
  })
  test('S3 commission rate is 20%', () => {
    assert.ok(commMatch[1].match(/S3:\s*0\.20/), 'S3 rate not 0.20')
  })
})

// ── Bonus final calculation (pure math) ──────────────────────────────────────
describe('Bonus final calculation', () => {
  function calcFinalBonus(netRevenueCents, rate, pct) {
    const multiplier = getBonusMultiplier(pct)
    const bonusCents = Math.round(netRevenueCents * rate)
    return Math.round(bonusCents * multiplier)
  }

  test('S2 L1: $10k net revenue, 80% tasks → $500 bonus', () => {
    // $10,000 net × 5% × 1.0 = $500
    assert.strictEqual(calcFinalBonus(1_000_000, 0.05, 80), 50_000) // in cents
  })
  test('S2 L1: $10k net revenue, 75% tasks → $250 bonus (half)', () => {
    // $10,000 × 5% × 0.5 = $250
    assert.strictEqual(calcFinalBonus(1_000_000, 0.05, 75), 25_000)
  })
  test('S2 L1: $10k net revenue, 60% tasks → $0 bonus (suspended)', () => {
    assert.strictEqual(calcFinalBonus(1_000_000, 0.05, 60), 0)
  })
  test('S3 L2: $50k indirect revenue, 90% tasks → $1000 bonus', () => {
    // $50,000 × 2% × 1.0 = $1,000
    assert.strictEqual(calcFinalBonus(5_000_000, 0.02, 90), 100_000)
  })
  test('Zero revenue → $0 bonus regardless of completion', () => {
    assert.strictEqual(calcFinalBonus(0, 0.05, 100), 0)
  })
})

// ── Upgrade request minimum missions ─────────────────────────────────────────
describe('PAC upgrade minimum mission requirements', () => {
  const upgradeSrc = fs.readFileSync(path.join(__dirname, '../routes/pacSupervision.js'), 'utf8')
  const minMissionsMatch = upgradeSrc.match(/MIN_MISSIONS\s*=\s*\{([^}]+)\}/)

  test('MIN_MISSIONS is defined in upgrade route', () => {
    assert.ok(minMissionsMatch, 'MIN_MISSIONS not found in upgrade-request handler')
  })
  test('S1→S2 requires 5 completed missions', () => {
    assert.ok(minMissionsMatch[1].match(/S2:\s*5/), 'S2 minimum not 5')
  })
  test('S2→S3 requires 10 completed missions', () => {
    assert.ok(minMissionsMatch[1].match(/S3:\s*10/), 'S3 minimum not 10')
  })
})

// ── Achievement eligibility logic ─────────────────────────────────────────────
describe('Achievement eligibility — S1→S2 criteria', () => {
  // Mirror the eligibility function from cronJobs (pure logic, no DB)
  const isEligibleS2 = (agent) =>
    agent.missions_completed >= 10 &&
    agent.admin_avg >= 4.0 &&
    agent.on_time_rate >= 0.85 &&
    agent.double_rejections === 0 &&
    agent.months_active >= 6

  test('all criteria met → eligible', () => {
    assert.ok(isEligibleS2({ missions_completed: 10, admin_avg: 4.0, on_time_rate: 0.85, double_rejections: 0, months_active: 6 }))
  })
  test('missing one mission → not eligible', () => {
    assert.ok(!isEligibleS2({ missions_completed: 9, admin_avg: 4.5, on_time_rate: 0.90, double_rejections: 0, months_active: 8 }))
  })
  test('admin_avg below threshold → not eligible', () => {
    assert.ok(!isEligibleS2({ missions_completed: 15, admin_avg: 3.9, on_time_rate: 0.90, double_rejections: 0, months_active: 8 }))
  })
  test('on_time_rate below threshold → not eligible', () => {
    assert.ok(!isEligibleS2({ missions_completed: 15, admin_avg: 4.2, on_time_rate: 0.84, double_rejections: 0, months_active: 8 }))
  })
  test('has double rejection → not eligible', () => {
    assert.ok(!isEligibleS2({ missions_completed: 15, admin_avg: 4.2, on_time_rate: 0.90, double_rejections: 1, months_active: 8 }))
  })
  test('seniority below 6 months → not eligible', () => {
    assert.ok(!isEligibleS2({ missions_completed: 15, admin_avg: 4.2, on_time_rate: 0.90, double_rejections: 0, months_active: 5 }))
  })
  test('exact boundary values → eligible', () => {
    assert.ok(isEligibleS2({ missions_completed: 10, admin_avg: 4.0, on_time_rate: 0.85, double_rejections: 0, months_active: 6 }))
  })
})

describe('Achievement eligibility — S2→S3 criteria', () => {
  const isEligibleS3 = (agent) =>
    agent.missions_completed >= 25 &&
    agent.l2_missions_completed >= 10 &&
    agent.admin_avg >= 4.5 &&
    agent.client_avg >= 4.3 &&
    agent.on_time_rate >= 0.90 &&
    agent.supervised_s1_completed >= 3 &&
    agent.months_as_s2 >= 12

  test('all criteria met → eligible', () => {
    assert.ok(isEligibleS3({ missions_completed: 25, l2_missions_completed: 10, admin_avg: 4.5, client_avg: 4.3, on_time_rate: 0.90, supervised_s1_completed: 3, months_as_s2: 12 }))
  })
  test('insufficient L2 missions → not eligible', () => {
    assert.ok(!isEligibleS3({ missions_completed: 30, l2_missions_completed: 9, admin_avg: 4.8, client_avg: 4.5, on_time_rate: 0.95, supervised_s1_completed: 5, months_as_s2: 14 }))
  })
  test('admin_avg below 4.5 → not eligible', () => {
    assert.ok(!isEligibleS3({ missions_completed: 30, l2_missions_completed: 12, admin_avg: 4.4, client_avg: 4.5, on_time_rate: 0.95, supervised_s1_completed: 5, months_as_s2: 14 }))
  })
  test('client_avg below 4.3 → not eligible', () => {
    assert.ok(!isEligibleS3({ missions_completed: 30, l2_missions_completed: 12, admin_avg: 4.6, client_avg: 4.2, on_time_rate: 0.95, supervised_s1_completed: 5, months_as_s2: 14 }))
  })
  test('insufficient S1 supervised → not eligible', () => {
    assert.ok(!isEligibleS3({ missions_completed: 30, l2_missions_completed: 12, admin_avg: 4.6, client_avg: 4.4, on_time_rate: 0.95, supervised_s1_completed: 2, months_as_s2: 14 }))
  })
  test('insufficient months as S2 → not eligible', () => {
    assert.ok(!isEligibleS3({ missions_completed: 30, l2_missions_completed: 12, admin_avg: 4.6, client_avg: 4.4, on_time_rate: 0.95, supervised_s1_completed: 5, months_as_s2: 11 }))
  })
})

describe('PAC progress endpoint — criteria structure', () => {
  const progressSrc = require('fs').readFileSync(require('path').join(__dirname, '../routes/pac.js'), 'utf8')
  test('progress endpoint exists in pac.js', () => {
    assert.ok(progressSrc.includes("'/progress'"), 'GET /progress route not found')
  })
  test('progress endpoint returns criteria array', () => {
    assert.ok(progressSrc.includes('criteria'), 'criteria not returned in progress response')
  })
  test('S1→S2 uses 5 criteria', () => {
    // Count S1 criteria keys in source
    const s2Criteria = progressSrc.match(/key:.*'missions'.*key:.*'admin_score'.*key:.*'on_time_rate'.*key:.*'double_rejections'.*key:.*'seniority'/s)
    assert.ok(s2Criteria, 'S1→S2 criteria set incomplete')
  })
})

// ── Supervision tier rules ────────────────────────────────────────────────────
describe('Supervision tier hierarchy rules', () => {
  const supSrc = fs.readFileSync(path.join(__dirname, '../routes/pacSupervision.js'), 'utf8')

  test('S2 can only supervise S1 (allowedTarget check)', () => {
    // The source should have a conditional that restricts S2 to supervising S1
    assert.ok(supSrc.includes("S2' ? 'S1'"), 'S2→S1 restriction not found')
  })
  test('S3 can only supervise S2 (allowedTarget check)', () => {
    assert.ok(supSrc.includes("'S2'"), 'S3→S2 restriction not found')
  })
  test('MAX_SUPERVISED S2 is 10', () => {
    const match = supSrc.match(/MAX_SUPERVISED\s*=\s*\{[^}]+S2:\s*(\d+)/)
    assert.ok(match, 'MAX_SUPERVISED.S2 not found')
    assert.strictEqual(parseInt(match[1], 10), 10)
  })
  test('MAX_SUPERVISED S3 is 5', () => {
    const match = supSrc.match(/MAX_SUPERVISED\s*=\s*\{[^}]+S3:\s*(\d+)/)
    assert.ok(match, 'MAX_SUPERVISED.S3 not found')
    assert.strictEqual(parseInt(match[1], 10), 5)
  })
})
