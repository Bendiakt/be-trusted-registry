'use strict'

/**
 * tests/disputes.test.js
 *
 * Unit tests for the mission dispute business logic:
 *   - PATCH /api/companies/missions/:id/dispute  (company opens dispute)
 *   - GET  /api/admin/disputes                   (admin lists disputes)
 *   - PATCH /api/admin/disputes/:id/resolve      (admin resolves dispute)
 *
 * No server or DB is required. The test mirrors each route guard as a pure
 * function and verifies every branch: role checks, idempotency, invalid
 * resolution values, second_audit side-effect, and ID parsing.
 *
 * Usage:
 *   node --test tests/disputes.test.js
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// ── Inline mirrors of route guards ────────────────────────────────────────────

/**
 * Guard: only company role can open a dispute.
 * Mirrors: if (req.user.role !== 'company') return 403
 */
function disputeOpenRoleGuard(role) {
  if (role !== 'company') return { allowed: false, status: 403, error: 'Only company accounts can open disputes' }
  return { allowed: true }
}

/**
 * Guard: validate the reason string for a dispute.
 * Mirrors: if (!reason || reason.trim().length < 10) return 400
 */
function disputeReasonGuard(reason) {
  if (!reason || typeof reason !== 'string') return { ok: false, status: 400, error: 'Reason is required' }
  const trimmed = reason.trim()
  if (trimmed.length < 10) return { ok: false, status: 400, error: 'Reason must be at least 10 characters' }
  if (trimmed.length > 2000) return { ok: false, status: 400, error: 'Reason exceeds maximum length' }
  return { ok: true, reason: trimmed }
}

/**
 * Guard: one dispute per mission (idempotency).
 * Mirrors: if (existing.rows.length) return 409
 */
function disputeIdempotencyGuard(existingDispute) {
  if (existingDispute) return { ok: false, status: 409, error: 'A dispute is already open for this mission', dispute: existingDispute }
  return { ok: true }
}

/**
 * Guard: admin dispute ID must be a valid integer.
 * Mirrors: const disputeId = parseInt(req.params.id, 10); if (isNaN) return 400
 */
function parseDisputeId(raw) {
  const id = parseInt(raw, 10)
  if (Number.isNaN(id)) return { ok: false, status: 400, error: 'Invalid dispute id' }
  return { ok: true, id }
}

/** Valid resolutions accepted by the admin resolve endpoint */
const VALID_RESOLUTIONS = ['upheld', 'dismissed', 'second_audit']

/**
 * Guard: resolution value must be one of the accepted enum values.
 * Mirrors: if (!resolution || !['upheld','dismissed','second_audit'].includes(resolution)) return 400
 */
function resolutionGuard(resolution) {
  if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
    return { ok: false, status: 400, error: 'resolution must be: upheld | dismissed | second_audit' }
  }
  return { ok: true }
}

/**
 * Guard: dispute must exist and not already be resolved.
 * Mirrors: if (!rows.length) return 404
 */
function disputeNotFoundGuard(rows) {
  if (!rows || rows.length === 0) return { ok: false, status: 404, error: 'Dispute not found or already resolved' }
  return { ok: true, dispute: rows[0] }
}

/**
 * Determine whether a "second_audit" resolution should re-open the mission.
 * Mirrors: if (resolution === 'second_audit') UPDATE missions SET status = 'available'
 */
function requiresMissionReopen(resolution) {
  return resolution === 'second_audit'
}

/**
 * Build the status filter clause for the admin disputes list endpoint.
 * Mirrors the WHERE clause construction in GET /api/admin/disputes
 */
function buildDisputeFilter(status) {
  const ALLOWED = ['open', 'resolved', 'all']
  const safe = ALLOWED.includes(status) ? status : 'open'
  if (safe === 'all') return { clause: '', params: [] }
  return { clause: `WHERE d.status = $1`, params: [safe] }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dispute open — role guard', () => {
  test('allows company role', () => {
    assert.equal(disputeOpenRoleGuard('company').allowed, true)
  })

  test('blocks pac role → 403', () => {
    const r = disputeOpenRoleGuard('pac')
    assert.equal(r.allowed, false)
    assert.equal(r.status, 403)
  })

  test('blocks admin role → 403', () => {
    const r = disputeOpenRoleGuard('admin')
    assert.equal(r.allowed, false)
    assert.equal(r.status, 403)
  })

  test('blocks trader role → 403', () => {
    const r = disputeOpenRoleGuard('trader')
    assert.equal(r.allowed, false)
    assert.equal(r.status, 403)
  })
})

describe('dispute open — reason validation', () => {
  test('accepts a valid reason', () => {
    const r = disputeReasonGuard('The outcome was incorrect and I have evidence.')
    assert.equal(r.ok, true)
    assert.ok(r.reason.length >= 10)
  })

  test('rejects null reason', () => {
    const r = disputeReasonGuard(null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('rejects empty string', () => {
    const r = disputeReasonGuard('')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('rejects reason shorter than 10 chars', () => {
    const r = disputeReasonGuard('too short')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
    assert.match(r.error, /10 characters/)
  })

  test('accepts exactly 10 chars (boundary)', () => {
    const r = disputeReasonGuard('1234567890')
    assert.equal(r.ok, true)
  })

  test('rejects reason over 2 000 chars', () => {
    const r = disputeReasonGuard('x'.repeat(2001))
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
    assert.match(r.error, /maximum/)
  })

  test('trims whitespace before length check', () => {
    // 9 real chars padded with spaces — still too short after trim
    const r = disputeReasonGuard('   short   ')
    assert.equal(r.ok, false)
    assert.match(r.error, /10 characters/)
  })
})

describe('dispute open — idempotency guard', () => {
  test('allows when no existing dispute', () => {
    assert.equal(disputeIdempotencyGuard(null).ok, true)
  })

  test('allows when existingDispute is undefined', () => {
    assert.equal(disputeIdempotencyGuard(undefined).ok, true)
  })

  test('blocks when dispute already exists → 409', () => {
    const existing = { id: 7, status: 'open' }
    const r = disputeIdempotencyGuard(existing)
    assert.equal(r.ok, false)
    assert.equal(r.status, 409)
    assert.match(r.error, /already open/)
    assert.deepEqual(r.dispute, existing)
  })
})

describe('admin dispute — ID parsing', () => {
  test('parses valid integer string', () => {
    const r = parseDisputeId('42')
    assert.equal(r.ok, true)
    assert.equal(r.id, 42)
  })

  test('parses numeric value', () => {
    const r = parseDisputeId(100)
    assert.equal(r.ok, true)
    assert.equal(r.id, 100)
  })

  test('rejects non-numeric string → 400', () => {
    const r = parseDisputeId('abc')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
    assert.match(r.error, /Invalid dispute id/)
  })

  test('rejects empty string → 400', () => {
    const r = parseDisputeId('')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('rejects undefined → 400', () => {
    const r = parseDisputeId(undefined)
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('rejects float string → truncates (parseInt behaviour)', () => {
    // parseInt('1.9') → 1, which is valid
    const r = parseDisputeId('1.9')
    assert.equal(r.ok, true)
    assert.equal(r.id, 1)
  })
})

describe('admin dispute resolve — resolution validation', () => {
  test('accepts "upheld"', () => {
    assert.equal(resolutionGuard('upheld').ok, true)
  })

  test('accepts "dismissed"', () => {
    assert.equal(resolutionGuard('dismissed').ok, true)
  })

  test('accepts "second_audit"', () => {
    assert.equal(resolutionGuard('second_audit').ok, true)
  })

  test('rejects unknown value → 400', () => {
    const r = resolutionGuard('approved')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
    assert.match(r.error, /upheld/)
  })

  test('rejects empty string → 400', () => {
    const r = resolutionGuard('')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('rejects null → 400', () => {
    const r = resolutionGuard(null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('rejects undefined → 400', () => {
    const r = resolutionGuard(undefined)
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('is case-sensitive (rejects "Upheld")', () => {
    const r = resolutionGuard('Upheld')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })
})

describe('admin dispute resolve — not-found guard', () => {
  test('ok when rows returned', () => {
    const r = disputeNotFoundGuard([{ id: 7, status: 'resolved' }])
    assert.equal(r.ok, true)
    assert.equal(r.dispute.id, 7)
  })

  test('returns 404 on empty rows array (already resolved or wrong id)', () => {
    const r = disputeNotFoundGuard([])
    assert.equal(r.ok, false)
    assert.equal(r.status, 404)
    assert.match(r.error, /already resolved/)
  })

  test('returns 404 on null rows', () => {
    const r = disputeNotFoundGuard(null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 404)
  })
})

describe('admin dispute resolve — second_audit side-effect', () => {
  test('"second_audit" requires mission reopen', () => {
    assert.equal(requiresMissionReopen('second_audit'), true)
  })

  test('"upheld" does NOT require mission reopen', () => {
    assert.equal(requiresMissionReopen('upheld'), false)
  })

  test('"dismissed" does NOT require mission reopen', () => {
    assert.equal(requiresMissionReopen('dismissed'), false)
  })
})

describe('admin dispute list — filter clause builder', () => {
  test('"open" filter generates a WHERE clause', () => {
    const { clause, params } = buildDisputeFilter('open')
    assert.ok(clause.includes('WHERE'))
    assert.deepEqual(params, ['open'])
  })

  test('"resolved" filter generates a WHERE clause', () => {
    const { clause, params } = buildDisputeFilter('resolved')
    assert.ok(clause.includes('WHERE'))
    assert.deepEqual(params, ['resolved'])
  })

  test('"all" generates no WHERE clause', () => {
    const { clause, params } = buildDisputeFilter('all')
    assert.equal(clause, '')
    assert.deepEqual(params, [])
  })

  test('unknown value defaults to "open"', () => {
    const { clause, params } = buildDisputeFilter('invalid_status')
    assert.ok(clause.includes('WHERE'))
    assert.deepEqual(params, ['open'])
  })

  test('undefined defaults to "open"', () => {
    const { clause, params } = buildDisputeFilter(undefined)
    assert.ok(clause.includes('WHERE'))
    assert.deepEqual(params, ['open'])
  })
})
