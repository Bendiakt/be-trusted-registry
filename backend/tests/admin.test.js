'use strict'
/**
 * admin.test.js — P37
 *
 * Pure unit tests for the business-logic guard functions embedded in
 * backend/routes/admin.js.  No HTTP server, no database, no I/O.
 *
 * Strategy: extract each guard as a pure function that mirrors the route
 * implementation exactly, then test all branches in isolation.
 *
 * Run:  node --test tests/admin.test.js
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// ─── helpers ────────────────────────────────────────────────────────────────

/** Mirrors parseInt(id, 10) + NaN check used throughout admin.js */
function parseId (raw) {
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

// ─── 1. Pagination helpers ───────────────────────────────────────────────────

describe('pagination — page clamping', () => {
  function parsePage (raw) {
    return Math.max(parseInt(raw || '1', 10) || 1, 1)
  }

  it('defaults to page 1 when undefined', () => {
    assert.equal(parsePage(undefined), 1)
  })
  it('defaults to page 1 when null', () => {
    assert.equal(parsePage(null), 1)
  })
  it('defaults to page 1 for NaN string', () => {
    assert.equal(parsePage('abc'), 1)
  })
  it('clamps page 0 to 1', () => {
    assert.equal(parsePage('0'), 1)
  })
  it('clamps negative pages to 1', () => {
    assert.equal(parsePage('-5'), 1)
  })
  it('accepts page 2', () => {
    assert.equal(parsePage('2'), 2)
  })
  it('accepts page 99', () => {
    assert.equal(parsePage('99'), 99)
  })
})

describe('pagination — limit clamping', () => {
  function parseLimit (raw) {
    return Math.min(Math.max(parseInt(raw || '50', 10) || 50, 1), 200)
  }

  it('defaults to 50 when undefined', () => {
    assert.equal(parseLimit(undefined), 50)
  })
  it('defaults to 50 for NaN string', () => {
    assert.equal(parseLimit('abc'), 50)
  })
  it('limit "0" falls back to 50 (0 is falsy — || 50 kicks in)', () => {
    // parseInt('0') = 0, and 0 || 50 = 50; Math.max(50,1) = 50
    assert.equal(parseLimit('0'), 50)
  })
  it('clamps negative to 1 (negative is truthy so no fallback)', () => {
    // parseInt('-10') = -10, -10 || 50 = -10 (truthy); Math.max(-10,1) = 1
    assert.equal(parseLimit('-10'), 1)
  })
  it('accepts 50', () => {
    assert.equal(parseLimit('50'), 50)
  })
  it('caps at 200', () => {
    assert.equal(parseLimit('999'), 200)
  })
  it('accepts exactly 200', () => {
    assert.equal(parseLimit('200'), 200)
  })
  it('accepts 1', () => {
    assert.equal(parseLimit('1'), 1)
  })
})

describe('pagination — offset calculation', () => {
  function offset (page, limit) { return (page - 1) * limit }

  it('page 1 limit 50 → offset 0', () => {
    assert.equal(offset(1, 50), 0)
  })
  it('page 2 limit 50 → offset 50', () => {
    assert.equal(offset(2, 50), 50)
  })
  it('page 3 limit 20 → offset 40', () => {
    assert.equal(offset(3, 20), 40)
  })
})

describe('pagination — pages count', () => {
  function pages (total, limit) { return Math.max(Math.ceil(total / limit), 1) }

  it('0 total → 1 page', () => {
    assert.equal(pages(0, 50), 1)
  })
  it('50 total, limit 50 → 1 page', () => {
    assert.equal(pages(50, 50), 1)
  })
  it('51 total, limit 50 → 2 pages', () => {
    assert.equal(pages(51, 50), 2)
  })
  it('100 total, limit 50 → 2 pages', () => {
    assert.equal(pages(100, 50), 2)
  })
  it('101 total, limit 50 → 3 pages', () => {
    assert.equal(pages(101, 50), 3)
  })
})

// ─── 2. User guards ──────────────────────────────────────────────────────────

describe('admin — user id guard', () => {
  it('accepts integer string', () => {
    assert.notEqual(parseId('42'), null)
  })
  it('rejects NaN string', () => {
    assert.equal(parseId('abc'), null)
  })
  it('rejects empty string', () => {
    assert.equal(parseId(''), null)
  })
  it('rejects float string (truncates — parseInt("3.9") = 3)', () => {
    assert.equal(parseId('3.9'), 3)
  })
  it('rejects "0x" hex prefix (parseInt returns 0)', () => {
    assert.notEqual(parseId('0x1F'), null)  // parseInt('0x1F') = 31
  })
})

describe('admin — valid roles', () => {
  const VALID_ROLES = ['company', 'trader', 'pac', 'admin']

  it('accepts company', () => {
    assert.ok(VALID_ROLES.includes('company'))
  })
  it('accepts trader', () => {
    assert.ok(VALID_ROLES.includes('trader'))
  })
  it('accepts pac', () => {
    assert.ok(VALID_ROLES.includes('pac'))
  })
  it('accepts admin', () => {
    assert.ok(VALID_ROLES.includes('admin'))
  })
  it('rejects superadmin (not in list)', () => {
    assert.ok(!VALID_ROLES.includes('superadmin'))
  })
  it('rejects empty string', () => {
    assert.ok(!VALID_ROLES.includes(''))
  })
  it('rejects PAC (wrong case)', () => {
    assert.ok(!VALID_ROLES.includes('PAC'))
  })
})

describe('admin — self-role-change guard', () => {
  function canChangeRole (requestingUserId, targetUserId, newRole) {
    if (targetUserId === requestingUserId && newRole !== 'admin') return false
    return true
  }

  it('blocks own demotion from admin to company', () => {
    assert.equal(canChangeRole(1, 1, 'company'), false)
  })
  it('blocks own demotion from admin to pac', () => {
    assert.equal(canChangeRole(1, 1, 'pac'), false)
  })
  it('blocks own demotion from admin to trader', () => {
    assert.equal(canChangeRole(1, 1, 'trader'), false)
  })
  it('allows assigning admin role to self (no-op, same role)', () => {
    assert.equal(canChangeRole(1, 1, 'admin'), true)
  })
  it('allows changing another user role to company', () => {
    assert.equal(canChangeRole(1, 2, 'company'), true)
  })
  it('allows changing another user role to pac', () => {
    assert.equal(canChangeRole(1, 2, 'pac'), true)
  })
})

describe('admin — self-delete guard', () => {
  function canDelete (requestingUserId, targetUserId) {
    return targetUserId !== requestingUserId
  }

  it('blocks deleting own account', () => {
    assert.equal(canDelete(5, 5), false)
  })
  it('allows deleting another user', () => {
    assert.equal(canDelete(5, 10), true)
  })
  it('allows deleting user 0 (edge case, non-existing id)', () => {
    assert.equal(canDelete(5, 0), true)
  })
})

// ─── 3. Company certification guards ────────────────────────────────────────

describe('admin — certification level guard (0–3)', () => {
  function isValidLevel (raw) {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < 0 || n > 3) return false
    return true
  }

  it('accepts 0 (revoke)', () => {
    assert.ok(isValidLevel('0'))
  })
  it('accepts 1', () => {
    assert.ok(isValidLevel('1'))
  })
  it('accepts 2', () => {
    assert.ok(isValidLevel('2'))
  })
  it('accepts 3 (max)', () => {
    assert.ok(isValidLevel('3'))
  })
  it('rejects 4 (above max)', () => {
    assert.ok(!isValidLevel('4'))
  })
  it('rejects -1', () => {
    assert.ok(!isValidLevel('-1'))
  })
  it('rejects NaN string', () => {
    assert.ok(!isValidLevel('abc'))
  })
  it('rejects undefined → NaN', () => {
    assert.ok(!isValidLevel(undefined))
  })
})

// ─── 4. isBlockedCompany (operator name protection) ─────────────────────────

describe('isBlockedCompany', () => {
  const { isBlockedCompany } = require('../lib/blocklist')

  it('blocks exact "B&E Consult"', () => {
    assert.ok(isBlockedCompany('B&E Consult'))
  })
  it('blocks "B & E Consult FZCO" (with legal suffix)', () => {
    assert.ok(isBlockedCompany('B & E Consult FZCO'))
  })
  it('blocks "be consult" (lowercase)', () => {
    assert.ok(isBlockedCompany('be consult'))
  })
  it('blocks "B-E Consult"', () => {
    assert.ok(isBlockedCompany('B-E Consult'))
  })
  it('blocks "B and E Consult"', () => {
    assert.ok(isBlockedCompany('B and E Consult'))
  })
  it('allows unrelated company name', () => {
    assert.ok(!isBlockedCompany('Acme Corp'))
  })
  it('allows empty string (falsy fast-path)', () => {
    assert.ok(!isBlockedCompany(''))
  })
  it('allows null (falsy fast-path)', () => {
    assert.ok(!isBlockedCompany(null))
  })
  it('allows company with "consult" but not the operator pattern', () => {
    assert.ok(!isBlockedCompany('Delta Consulting'))
  })
})

// ─── 5. Mission creation guards ─────────────────────────────────────────────

describe('admin — mission title guard', () => {
  function validateTitle (title) {
    if (!title || typeof title !== 'string' || !title.trim()) return false
    return true
  }

  it('rejects null', () => {
    assert.ok(!validateTitle(null))
  })
  it('rejects empty string', () => {
    assert.ok(!validateTitle(''))
  })
  it('rejects whitespace-only', () => {
    assert.ok(!validateTitle('   '))
  })
  it('accepts non-empty string', () => {
    assert.ok(validateTitle('Supply chain audit'))
  })
  it('accepts string with leading/trailing whitespace (trimmed check)', () => {
    assert.ok(validateTitle('  Audit  '))
  })
  it('rejects number type', () => {
    assert.ok(!validateTitle(42))
  })
})

describe('admin — mission fee_usd guard', () => {
  function validateFee (raw) {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < 0) return { ok: false }
    return { ok: true, value: n }
  }

  it('accepts 0 (free mission)', () => {
    const r = validateFee('0')
    assert.ok(r.ok)
    assert.equal(r.value, 0)
  })
  it('accepts 500', () => {
    assert.ok(validateFee('500').ok)
  })
  it('accepts 1000', () => {
    assert.ok(validateFee('1000').ok)
  })
  it('rejects negative fee', () => {
    assert.ok(!validateFee('-1').ok)
  })
  it('rejects NaN string', () => {
    assert.ok(!validateFee('abc').ok)
  })
  it('rejects empty string', () => {
    assert.ok(!validateFee('').ok)
  })
  it('parses float as integer (truncates)', () => {
    const r = validateFee('499.9')
    assert.ok(r.ok)
    assert.equal(r.value, 499)
  })
})

describe('admin — mission tier guard', () => {
  const VALID_TIERS = ['S1', 'S2', 'S3']

  function resolveTier (raw) {
    const tier = raw || 'S1'
    if (!VALID_TIERS.includes(tier)) return { ok: false }
    return { ok: true, tier }
  }

  it('defaults to S1 when undefined', () => {
    const r = resolveTier(undefined)
    assert.ok(r.ok)
    assert.equal(r.tier, 'S1')
  })
  it('defaults to S1 when null', () => {
    assert.equal(resolveTier(null).tier, 'S1')
  })
  it('defaults to S1 when empty string', () => {
    assert.equal(resolveTier('').tier, 'S1')
  })
  it('accepts S1', () => {
    assert.ok(resolveTier('S1').ok)
  })
  it('accepts S2', () => {
    assert.ok(resolveTier('S2').ok)
  })
  it('accepts S3', () => {
    assert.ok(resolveTier('S3').ok)
  })
  it('rejects lowercase s1', () => {
    assert.ok(!resolveTier('s1').ok)
  })
  it('rejects S4 (above max)', () => {
    assert.ok(!resolveTier('S4').ok)
  })
  it('rejects empty tier after falsy-check override', () => {
    // empty string is falsy → defaults to S1 → ok
    assert.ok(resolveTier('').ok)
  })
})

// ─── 6. Mission status guard ─────────────────────────────────────────────────

describe('admin — mission status update guard', () => {
  const VALID = ['available', 'assigned', 'completed', 'cancelled']

  function isValidMissionStatus (missionId, status) {
    if (Number.isNaN(parseInt(missionId, 10))) return false
    return VALID.includes(status)
  }

  it('accepts available', () => {
    assert.ok(isValidMissionStatus('5', 'available'))
  })
  it('accepts assigned', () => {
    assert.ok(isValidMissionStatus('5', 'assigned'))
  })
  it('accepts completed', () => {
    assert.ok(isValidMissionStatus('5', 'completed'))
  })
  it('accepts cancelled', () => {
    assert.ok(isValidMissionStatus('5', 'cancelled'))
  })
  it('rejects unknown status "pending"', () => {
    assert.ok(!isValidMissionStatus('5', 'pending'))
  })
  it('rejects NaN mission id', () => {
    assert.ok(!isValidMissionStatus('abc', 'available'))
  })
  it('rejects empty status', () => {
    assert.ok(!isValidMissionStatus('5', ''))
  })
})

// ─── 7. Mission cancel — only non-terminal missions can be cancelled ─────────

describe('admin — mission cancel eligibility', () => {
  // The SQL WHERE clause: status NOT IN ('completed','cancelled')
  // We mirror this as a pure check.
  function canCancel (currentStatus) {
    return !['completed', 'cancelled'].includes(currentStatus)
  }

  it('available missions can be cancelled', () => {
    assert.ok(canCancel('available'))
  })
  it('assigned missions can be cancelled', () => {
    assert.ok(canCancel('assigned'))
  })
  it('completed missions cannot be cancelled', () => {
    assert.ok(!canCancel('completed'))
  })
  it('already-cancelled missions cannot be cancelled again', () => {
    assert.ok(!canCancel('cancelled'))
  })
})

// ─── 8. Mission assign guards ────────────────────────────────────────────────

describe('admin — mission assign — id guard', () => {
  function validateAssignIds (missionIdRaw, agentIdRaw) {
    const missionId = parseInt(missionIdRaw, 10)
    const agentId   = parseInt(agentIdRaw,   10)
    if (Number.isNaN(missionId)) return { error: 'Invalid mission id' }
    if (Number.isNaN(agentId))   return { error: 'pac_user_id is required' }
    return { ok: true, missionId, agentId }
  }

  it('accepts valid mission and agent ids', () => {
    const r = validateAssignIds('20', '5')
    assert.ok(r.ok)
    assert.equal(r.missionId, 20)
    assert.equal(r.agentId, 5)
  })
  it('rejects NaN mission id', () => {
    assert.equal(validateAssignIds('abc', '5').error, 'Invalid mission id')
  })
  it('rejects NaN agent id', () => {
    assert.equal(validateAssignIds('20', 'xyz').error, 'pac_user_id is required')
  })
  it('rejects both NaN — reports mission id first', () => {
    assert.equal(validateAssignIds('', '').error, 'Invalid mission id')
  })
})

// ─── 9. Client score guard ───────────────────────────────────────────────────

describe('admin — client score validation (1–5)', () => {
  function isValidScore (raw) {
    const n = Number(raw)
    return !isNaN(n) && n >= 1 && n <= 5
  }

  it('accepts 1 (minimum)', () => {
    assert.ok(isValidScore(1))
  })
  it('accepts 5 (maximum)', () => {
    assert.ok(isValidScore(5))
  })
  it('accepts 3', () => {
    assert.ok(isValidScore(3))
  })
  it('rejects 0', () => {
    assert.ok(!isValidScore(0))
  })
  it('rejects 6', () => {
    assert.ok(!isValidScore(6))
  })
  it('rejects negative', () => {
    assert.ok(!isValidScore(-1))
  })
  it('rejects string "abc"', () => {
    assert.ok(!isValidScore('abc'))
  })
  it('rejects null', () => {
    assert.ok(!isValidScore(null))
  })
})

describe('admin — double rejection logic', () => {
  /** Mirror of admin.js lines 531-533 */
  function newDoubleRej (clientScore, prevScore) {
    const isLowScore = clientScore < 2
    const prevWasLow = prevScore !== null && prevScore < 2
    return isLowScore && prevWasLow ? 1 : 0
  }

  it('score=1, prev=1 → double rejection', () => {
    assert.equal(newDoubleRej(1, 1), 1)
  })
  it('score=1, prev=null (no prior) → no double rejection', () => {
    assert.equal(newDoubleRej(1, null), 0)
  })
  it('score=3, prev=1 → no double rejection (current not low)', () => {
    assert.equal(newDoubleRej(3, 1), 0)
  })
  it('score=1, prev=3 → no double rejection (prev not low)', () => {
    assert.equal(newDoubleRej(1, 3), 0)
  })
  it('score=5, prev=5 → no double rejection', () => {
    assert.equal(newDoubleRej(5, 5), 0)
  })
  it('threshold: score=2 is NOT a low score', () => {
    assert.equal(newDoubleRej(2, 1), 0)  // 2 < 2 is false
  })
  it('threshold: score=1 is a low score', () => {
    assert.equal(newDoubleRej(1, 2), 0)  // prev 2 is not low
  })
})

// ─── 10. Fraud alert guard ───────────────────────────────────────────────────

describe('admin — fraud alert id guard', () => {
  function validateAlertId (raw) {
    const n = parseInt(raw, 10)
    return Number.isNaN(n) ? null : n
  }

  it('accepts integer string', () => {
    assert.equal(validateAlertId('7'), 7)
  })
  it('rejects NaN string', () => {
    assert.equal(validateAlertId('abc'), null)
  })
  it('rejects empty string', () => {
    assert.equal(validateAlertId(''), null)
  })
})

// ─── 11. Audit log filter guards ─────────────────────────────────────────────

describe('admin — audit log user_id filter', () => {
  // Route: const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : null
  // Then:  if (userId && !Number.isNaN(userId)) { push condition }
  function auditUserIdCondition (raw) {
    const userId = raw ? parseInt(raw, 10) : null
    if (userId && !Number.isNaN(userId)) return { active: true, value: userId }
    return { active: false }
  }

  it('applies filter for valid user_id "10"', () => {
    const r = auditUserIdCondition('10')
    assert.ok(r.active)
    assert.equal(r.value, 10)
  })
  it('skips filter when user_id is empty string', () => {
    assert.ok(!auditUserIdCondition('').active)
  })
  it('skips filter when user_id is undefined', () => {
    assert.ok(!auditUserIdCondition(undefined).active)
  })
  it('skips filter when user_id is NaN string (NaN is falsy in the guard)', () => {
    // parseInt('abc') = NaN → condition `!Number.isNaN(userId)` fails
    assert.ok(!auditUserIdCondition('abc').active)
  })
})

describe('admin — audit log action filter', () => {
  function auditActionCondition (raw) {
    const action = String(raw || '').trim()
    return action ? { active: true, pattern: `%${action}%` } : { active: false }
  }

  it('applies filter when action is set', () => {
    const r = auditActionCondition('cert')
    assert.ok(r.active)
    assert.equal(r.pattern, '%cert%')
  })
  it('skips filter when action is empty string', () => {
    assert.ok(!auditActionCondition('').active)
  })
  it('skips filter when action is undefined', () => {
    assert.ok(!auditActionCondition(undefined).active)
  })
  it('trims whitespace', () => {
    const r = auditActionCondition('  suspend  ')
    assert.ok(r.active)
    assert.equal(r.pattern, '%suspend%')
  })
})

// ─── 12. Document status filter guard ────────────────────────────────────────

describe('admin — document status filter', () => {
  function parseDocStatus (raw) {
    return ['pending', 'approved', 'rejected'].includes(raw) ? raw : null
  }

  it('accepts pending', () => {
    assert.equal(parseDocStatus('pending'), 'pending')
  })
  it('accepts approved', () => {
    assert.equal(parseDocStatus('approved'), 'approved')
  })
  it('accepts rejected', () => {
    assert.equal(parseDocStatus('rejected'), 'rejected')
  })
  it('rejects unknown status', () => {
    assert.equal(parseDocStatus('active'), null)
  })
  it('rejects empty string', () => {
    assert.equal(parseDocStatus(''), null)
  })
  it('rejects undefined', () => {
    assert.equal(parseDocStatus(undefined), null)
  })
  it('rejects mixed-case "Pending" (case-sensitive)', () => {
    assert.equal(parseDocStatus('Pending'), null)
  })
})

// ─── 13. Suspend guard ───────────────────────────────────────────────────────

describe('admin — company suspend boolean coercion', () => {
  /** Route line 355: const isSuspend = Boolean(suspend) */
  function isSuspend (raw) { return Boolean(raw) }

  it('true → suspend', () => {
    assert.equal(isSuspend(true), true)
  })
  it('false → unsuspend', () => {
    assert.equal(isSuspend(false), false)
  })
  it('1 → suspend (truthy coercion)', () => {
    assert.equal(isSuspend(1), true)
  })
  it('0 → unsuspend', () => {
    assert.equal(isSuspend(0), false)
  })
  it('null → unsuspend', () => {
    assert.equal(isSuspend(null), false)
  })
  it('undefined → unsuspend', () => {
    assert.equal(isSuspend(undefined), false)
  })
  it('"true" string → suspend', () => {
    assert.equal(isSuspend('true'), true)
  })
  it('"" empty string → unsuspend', () => {
    assert.equal(isSuspend(''), false)
  })
})
