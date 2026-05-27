'use strict'
/**
 * tests/validators.test.js
 *
 * Unit tests for every Zod schema in lib/validators.js.
 * Each schema gets at least one valid case and the key invalid cases.
 * No network / DB calls — pure in-process validation.
 *
 * Usage:
 *   node --test tests/validators.test.js
 *   npm test   (runs all tests/*.test.js)
 */

const { test, describe } = require('node:test')
const assert             = require('node:assert/strict')
const { schemas, validate } = require('../lib/validators')

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse `data` against `schema` and return { ok, data, errors }.
 */
function parse(schema, data) {
  const result = schema.safeParse(data)
  if (result.success) return { ok: true, data: result.data, errors: [] }
  return {
    ok: false,
    data: null,
    errors: result.error.errors.map((e) => ({ field: e.path.join('.') || 'body', message: e.message })),
  }
}

/** Assert parse succeeds and return parsed data. */
function expectOk(schema, data) {
  const r = parse(schema, data)
  assert.equal(r.ok, true, `Expected parse to succeed but got errors: ${JSON.stringify(r.errors)}`)
  return r.data
}

/** Assert parse fails and return error array. */
function expectFail(schema, data) {
  const r = parse(schema, data)
  assert.equal(r.ok, false, `Expected parse to fail but it succeeded with: ${JSON.stringify(r.data)}`)
  return r.errors
}

/** Assert that at least one error targets the given field. */
function hasFieldError(errors, field) {
  return errors.some((e) => e.field === field)
}

// ── validate() middleware factory ─────────────────────────────────────────────

describe('validate() middleware', () => {
  test('calls next() and replaces req.body on success', () => {
    const mw  = validate(schemas.login)
    const req = { body: { email: 'A@EXAMPLE.COM', password: 'secret' } }
    let nextCalled = false
    const next = () => { nextCalled = true }
    mw(req, {}, next)
    assert.equal(nextCalled, true)
    assert.equal(req.body.email, 'a@example.com') // lowercased by schema
  })

  test('returns 400 with structured errors on failure', () => {
    const mw = validate(schemas.login)
    const req = { body: { email: 'not-an-email', password: '' } }
    let sentStatus = null
    let sentBody   = null
    const res = {
      status: (s) => { sentStatus = s; return res },
      json:   (b) => { sentBody  = b; return res },
    }
    let nextCalled = false
    mw(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(sentStatus, 400)
    assert.equal(sentBody.error, 'Validation failed')
    assert.ok(Array.isArray(sentBody.errors))
  })
})

// ── Auth schemas ──────────────────────────────────────────────────────────────

describe('schemas.register', () => {
  const valid = { name: 'Alice Dupont', email: 'alice@example.com', password: 'securePass1', role: 'company' }

  test('accepts valid registration', () => {
    const d = expectOk(schemas.register, valid)
    assert.equal(d.email, 'alice@example.com')
    assert.equal(d.role, 'company')
  })

  test('defaults role to "company" when omitted', () => {
    const d = expectOk(schemas.register, { ...valid, role: undefined })
    assert.equal(d.role, 'company')
  })

  test('lowercases and trims email', () => {
    const d = expectOk(schemas.register, { ...valid, email: '  ALICE@EXAMPLE.COM  ' })
    assert.equal(d.email, 'alice@example.com')
  })

  test('rejects name shorter than 2 chars', () => {
    const errs = expectFail(schemas.register, { ...valid, name: 'A' })
    assert.ok(hasFieldError(errs, 'name'))
  })

  test('rejects invalid email', () => {
    const errs = expectFail(schemas.register, { ...valid, email: 'not-an-email' })
    assert.ok(hasFieldError(errs, 'email'))
  })

  test('rejects password shorter than 8 chars', () => {
    const errs = expectFail(schemas.register, { ...valid, password: 'abc' })
    assert.ok(hasFieldError(errs, 'password'))
  })

  test('rejects invalid role', () => {
    const errs = expectFail(schemas.register, { ...valid, role: 'superuser' })
    assert.ok(hasFieldError(errs, 'role'))
  })

  test('accepts all valid roles', () => {
    for (const role of ['company', 'pac', 'trader']) {
      assert.equal(parse(schemas.register, { ...valid, role }).ok, true, `role "${role}" should be accepted`)
    }
  })
})

describe('schemas.login', () => {
  const valid = { email: 'bob@example.com', password: 'anypassword' }

  test('accepts valid credentials', () => {
    const d = expectOk(schemas.login, valid)
    assert.equal(d.email, 'bob@example.com')
  })

  test('lowercases email', () => {
    const d = expectOk(schemas.login, { email: 'BOB@EXAMPLE.COM', password: 'pw' })
    assert.equal(d.email, 'bob@example.com')
  })

  test('rejects empty password', () => {
    const errs = expectFail(schemas.login, { email: valid.email, password: '' })
    assert.ok(hasFieldError(errs, 'password'))
  })

  test('rejects invalid email', () => {
    expectFail(schemas.login, { email: 'bad', password: 'pw' })
  })
})

describe('schemas.forgotPassword', () => {
  test('accepts valid email', () => {
    const d = expectOk(schemas.forgotPassword, { email: 'user@example.com' })
    assert.equal(d.email, 'user@example.com')
  })

  test('rejects missing email', () => {
    expectFail(schemas.forgotPassword, {})
  })

  test('rejects invalid email', () => {
    expectFail(schemas.forgotPassword, { email: 'notanemail' })
  })
})

describe('schemas.resetPassword', () => {
  const valid = { token: 'abc123token', password: 'NewPass123' }

  test('accepts valid reset data', () => {
    expectOk(schemas.resetPassword, valid)
  })

  test('rejects empty token', () => {
    const errs = expectFail(schemas.resetPassword, { ...valid, token: '' })
    assert.ok(hasFieldError(errs, 'token'))
  })

  test('rejects short password', () => {
    const errs = expectFail(schemas.resetPassword, { ...valid, password: 'short' })
    assert.ok(hasFieldError(errs, 'password'))
  })
})

describe('schemas.resendVerify', () => {
  test('accepts valid email', () => {
    expectOk(schemas.resendVerify, { email: 'user@example.com' })
  })

  test('rejects invalid email', () => {
    expectFail(schemas.resendVerify, { email: 'bad' })
  })
})

describe('schemas.updateProfile', () => {
  test('accepts empty update (all optional)', () => {
    expectOk(schemas.updateProfile, {})
  })

  test('accepts name-only update', () => {
    const d = expectOk(schemas.updateProfile, { name: 'New Name' })
    assert.equal(d.name, 'New Name')
  })

  test('accepts password change with both fields', () => {
    expectOk(schemas.updateProfile, { currentPassword: 'OldPass1', newPassword: 'NewPass2!' })
  })

  test('rejects newPassword without currentPassword', () => {
    const errs = expectFail(schemas.updateProfile, { newPassword: 'NewPass2!' })
    assert.ok(hasFieldError(errs, 'currentPassword'))
  })

  test('rejects name shorter than 2 chars', () => {
    const errs = expectFail(schemas.updateProfile, { name: 'X' })
    assert.ok(hasFieldError(errs, 'name'))
  })
})

// ── Company schemas ───────────────────────────────────────────────────────────

describe('schemas.createCompany', () => {
  const valid = { name: 'Acme Corp', country: 'France' }

  test('accepts minimal valid data', () => {
    const d = expectOk(schemas.createCompany, valid)
    assert.equal(d.name, 'Acme Corp')
  })

  test('accepts full data with optional fields', () => {
    expectOk(schemas.createCompany, {
      ...valid,
      industry:    'Technology',
      sector:      'SaaS',
      description: 'A great company.',
      website:     'https://acme.example.com',
    })
  })

  test('accepts empty string website (treated as optional)', () => {
    expectOk(schemas.createCompany, { ...valid, website: '' })
  })

  test('rejects name shorter than 2 chars', () => {
    const errs = expectFail(schemas.createCompany, { ...valid, name: 'A' })
    assert.ok(hasFieldError(errs, 'name'))
  })

  test('rejects missing country', () => {
    expectFail(schemas.createCompany, { name: 'Acme' })
  })

  test('rejects invalid URL for website', () => {
    const errs = expectFail(schemas.createCompany, { ...valid, website: 'not-a-url' })
    assert.ok(hasFieldError(errs, 'website'))
  })
})

describe('schemas.updateCompany', () => {
  test('accepts partial update (all optional)', () => {
    expectOk(schemas.updateCompany, {})
  })

  test('accepts valid website URL', () => {
    const d = expectOk(schemas.updateCompany, { website: 'https://example.com' })
    assert.equal(d.website, 'https://example.com')
  })

  test('accepts empty string website', () => {
    expectOk(schemas.updateCompany, { website: '' })
  })

  test('rejects invalid URL', () => {
    const errs = expectFail(schemas.updateCompany, { website: 'ftp-not-valid' })
    assert.ok(hasFieldError(errs, 'website'))
  })
})

// ── Admin schemas ─────────────────────────────────────────────────────────────

describe('schemas.assignRole', () => {
  test('accepts all valid roles', () => {
    for (const role of ['company', 'pac', 'trader', 'admin']) {
      const d = expectOk(schemas.assignRole, { role })
      assert.equal(d.role, role)
    }
  })

  test('rejects invalid role', () => {
    const errs = expectFail(schemas.assignRole, { role: 'superadmin' })
    assert.ok(hasFieldError(errs, 'role'))
  })

  test('rejects missing role', () => {
    expectFail(schemas.assignRole, {})
  })
})

describe('schemas.certifyCompany', () => {
  test('accepts valid certification levels 0-3', () => {
    for (const level of [0, 1, 2, 3]) {
      const d = expectOk(schemas.certifyCompany, { level })
      assert.equal(d.level, level)
    }
  })

  test('coerces string "2" to number 2', () => {
    const d = expectOk(schemas.certifyCompany, { level: '2' })
    assert.equal(d.level, 2)
  })

  test('rejects level 4 (out of range)', () => {
    const errs = expectFail(schemas.certifyCompany, { level: 4 })
    assert.ok(hasFieldError(errs, 'level'))
  })

  test('rejects negative level', () => {
    expectFail(schemas.certifyCompany, { level: -1 })
  })

  test('rejects non-integer float', () => {
    expectFail(schemas.certifyCompany, { level: 1.5 })
  })
})

describe('schemas.suspendCompany', () => {
  test('accepts suspend: true with reason', () => {
    const d = expectOk(schemas.suspendCompany, { suspend: true, reason: 'fraud' })
    assert.equal(d.suspend, true)
    assert.equal(d.reason, 'fraud')
  })

  test('accepts suspend: false without reason', () => {
    const d = expectOk(schemas.suspendCompany, { suspend: false })
    assert.equal(d.suspend, false)
  })

  test('rejects missing suspend field', () => {
    const errs = expectFail(schemas.suspendCompany, {})
    assert.ok(hasFieldError(errs, 'suspend'))
  })

  test('rejects non-boolean suspend', () => {
    expectFail(schemas.suspendCompany, { suspend: 'yes' })
  })
})

describe('schemas.updateCompanyStatus', () => {
  test('accepts valid statuses', () => {
    for (const status of ['active', 'suspended', 'pending']) {
      const d = expectOk(schemas.updateCompanyStatus, { status })
      assert.equal(d.status, status)
    }
  })

  test('rejects invalid status', () => {
    const errs = expectFail(schemas.updateCompanyStatus, { status: 'archived' })
    assert.ok(hasFieldError(errs, 'status'))
  })
})

// ── PAC schemas ───────────────────────────────────────────────────────────────

describe('schemas.updatePacProfile', () => {
  test('accepts empty update (all optional)', () => {
    expectOk(schemas.updatePacProfile, {})
  })

  test('accepts full profile update', () => {
    const d = expectOk(schemas.updatePacProfile, {
      name:           'Alice PAC',
      location:       'Paris, France',
      languages:      ['fr', 'en'],
      certifications: ['ISO 9001', 'ISO 14001'],
      bio:            'Experienced auditor.',
    })
    assert.deepEqual(d.languages, ['fr', 'en'])
  })

  test('rejects name shorter than 2 chars', () => {
    const errs = expectFail(schemas.updatePacProfile, { name: 'X' })
    assert.ok(hasFieldError(errs, 'name'))
  })

  test('rejects languages array exceeding 20 items', () => {
    const langs = Array.from({ length: 21 }, (_, i) => `lang${i}`)
    expectFail(schemas.updatePacProfile, { languages: langs })
  })

  test('rejects non-array languages', () => {
    expectFail(schemas.updatePacProfile, { languages: 'fr,en' })
  })
})

describe('schemas.submitMissionReport', () => {
  const valid = { report_text: 'A'.repeat(10), outcome: 'pass' }

  test('accepts valid report', () => {
    const d = expectOk(schemas.submitMissionReport, valid)
    assert.equal(d.outcome, 'pass')
  })

  test('accepts all valid outcomes', () => {
    for (const outcome of ['pass', 'fail', 'inconclusive']) {
      assert.equal(parse(schemas.submitMissionReport, { ...valid, outcome }).ok, true)
    }
  })

  test('rejects report shorter than 10 chars', () => {
    const errs = expectFail(schemas.submitMissionReport, { ...valid, report_text: 'Short' })
    assert.ok(hasFieldError(errs, 'report_text'))
  })

  test('rejects invalid outcome', () => {
    const errs = expectFail(schemas.submitMissionReport, { ...valid, outcome: 'skip' })
    assert.ok(hasFieldError(errs, 'outcome'))
  })
})

// ── 2FA TOTP schemas ──────────────────────────────────────────────────────────

describe('schemas.totpVerify', () => {
  test('accepts 6-digit token', () => {
    const d = expectOk(schemas.totpVerify, { token: '123456' })
    assert.equal(d.token, '123456')
  })

  test('rejects token with fewer than 6 chars', () => {
    const errs = expectFail(schemas.totpVerify, { token: '12345' })
    assert.ok(hasFieldError(errs, 'token'))
  })

  test('rejects token with more than 6 chars', () => {
    expectFail(schemas.totpVerify, { token: '1234567' })
  })

  test('rejects non-digit token', () => {
    expectFail(schemas.totpVerify, { token: 'abcdef' })
  })

  test('rejects missing token', () => {
    expectFail(schemas.totpVerify, {})
  })
})

describe('schemas.totpValidate', () => {
  const valid = { tempToken: 'eyJhbGciOiJIUzI1NiJ9.test', token: '654321' }

  test('accepts valid temp token + TOTP', () => {
    expectOk(schemas.totpValidate, valid)
  })

  test('rejects empty tempToken', () => {
    const errs = expectFail(schemas.totpValidate, { ...valid, tempToken: '' })
    assert.ok(hasFieldError(errs, 'tempToken'))
  })

  test('rejects non-6-digit token', () => {
    const errs = expectFail(schemas.totpValidate, { ...valid, token: '12' })
    assert.ok(hasFieldError(errs, 'token'))
  })
})

describe('schemas.totpDisable', () => {
  const valid = { password: 'MyPassword1', token: '000000' }

  test('accepts valid password + TOTP', () => {
    expectOk(schemas.totpDisable, valid)
  })

  test('rejects empty password', () => {
    const errs = expectFail(schemas.totpDisable, { ...valid, password: '' })
    assert.ok(hasFieldError(errs, 'password'))
  })

  test('rejects non-6-digit token', () => {
    const errs = expectFail(schemas.totpDisable, { ...valid, token: 'abc123' })
    assert.ok(hasFieldError(errs, 'token'))
  })
})

// ── Document schemas ──────────────────────────────────────────────────────────

describe('schemas.uploadDocument', () => {
  test('accepts empty body (both fields optional)', () => {
    expectOk(schemas.uploadDocument, {})
  })

  test('accepts type and note', () => {
    const d = expectOk(schemas.uploadDocument, { type: 'certificate', note: 'Annual review' })
    assert.equal(d.type, 'certificate')
  })

  test('trims whitespace from type', () => {
    const d = expectOk(schemas.uploadDocument, { type: '  certificate  ' })
    assert.equal(d.type, 'certificate')
  })
})

describe('schemas.reviewDocument', () => {
  test('accepts approved status', () => {
    const d = expectOk(schemas.reviewDocument, { status: 'approved' })
    assert.equal(d.status, 'approved')
  })

  test('accepts rejected status with note', () => {
    const d = expectOk(schemas.reviewDocument, { status: 'rejected', note: 'Missing signature' })
    assert.equal(d.note, 'Missing signature')
  })

  test('accepts without note (optional)', () => {
    const d = expectOk(schemas.reviewDocument, { status: 'approved' })
    assert.equal(d.note, undefined)
  })

  test('rejects invalid status', () => {
    const errs = expectFail(schemas.reviewDocument, { status: 'pending' })
    assert.ok(hasFieldError(errs, 'status'))
  })

  test('rejects missing status', () => {
    expectFail(schemas.reviewDocument, {})
  })

  test('rejects note exceeding 1000 chars', () => {
    const errs = expectFail(schemas.reviewDocument, { status: 'approved', note: 'x'.repeat(1001) })
    assert.ok(hasFieldError(errs, 'note'))
  })
})

describe('schemas.deleteAccount', () => {
  test('accepts valid password confirmation', () => {
    const d = expectOk(schemas.deleteAccount, { password: 'MySecret1!' })
    assert.equal(d.password, 'MySecret1!')
  })

  test('rejects empty password', () => {
    const errs = expectFail(schemas.deleteAccount, { password: '' })
    assert.ok(hasFieldError(errs, 'password'))
  })

  test('rejects missing password', () => {
    expectFail(schemas.deleteAccount, {})
  })

  test('rejects password longer than 128 chars', () => {
    const errs = expectFail(schemas.deleteAccount, { password: 'A'.repeat(129) })
    assert.ok(hasFieldError(errs, 'password'))
  })
})

// ── Payment schemas ───────────────────────────────────────────────────────────

describe('schemas.createCheckoutSession', () => {
  test('accepts valid planId without certificationId', () => {
    const d = expectOk(schemas.createCheckoutSession, { planId: 'level1' })
    assert.equal(d.planId, 'level1')
  })

  test('accepts all valid planIds', () => {
    for (const planId of ['level1', 'level2', 'level3']) {
      assert.equal(parse(schemas.createCheckoutSession, { planId }).ok, true)
    }
  })

  test('accepts planId + certificationId', () => {
    const d = expectOk(schemas.createCheckoutSession, { planId: 'level2', certificationId: 42 })
    assert.equal(d.certificationId, 42)
  })

  test('rejects invalid planId', () => {
    const errs = expectFail(schemas.createCheckoutSession, { planId: 'level4' })
    assert.ok(hasFieldError(errs, 'planId'))
  })

  test('rejects missing planId', () => {
    expectFail(schemas.createCheckoutSession, {})
  })

  test('rejects non-positive certificationId', () => {
    const errs = expectFail(schemas.createCheckoutSession, { planId: 'level1', certificationId: -1 })
    assert.ok(hasFieldError(errs, 'certificationId'))
  })

  test('rejects non-integer certificationId', () => {
    const errs = expectFail(schemas.createCheckoutSession, { planId: 'level1', certificationId: 1.5 })
    assert.ok(hasFieldError(errs, 'certificationId'))
  })
})

describe('schemas.renewalCheckout', () => {
  test('accepts valid planId', () => {
    const d = expectOk(schemas.renewalCheckout, { planId: 'level3' })
    assert.equal(d.planId, 'level3')
  })

  test('accepts all valid planIds', () => {
    for (const planId of ['level1', 'level2', 'level3']) {
      assert.equal(parse(schemas.renewalCheckout, { planId }).ok, true)
    }
  })

  test('rejects invalid planId', () => {
    const errs = expectFail(schemas.renewalCheckout, { planId: 'basic' })
    assert.ok(hasFieldError(errs, 'planId'))
  })

  test('rejects missing planId', () => {
    expectFail(schemas.renewalCheckout, {})
  })
})

describe('schemas.missionCheckout', () => {
  test('accepts valid missionId', () => {
    const d = expectOk(schemas.missionCheckout, { missionId: 42 })
    assert.equal(d.missionId, 42)
  })

  test('accepts missionId = 1 (minimum positive)', () => {
    const d = expectOk(schemas.missionCheckout, { missionId: 1 })
    assert.equal(d.missionId, 1)
  })

  test('rejects missing missionId', () => {
    const errs = expectFail(schemas.missionCheckout, {})
    assert.ok(errs.some(e => e.field === 'missionId'), `expected missionId error, got: ${JSON.stringify(errs)}`)
  })

  test('rejects missionId = 0', () => {
    const errs = expectFail(schemas.missionCheckout, { missionId: 0 })
    assert.ok(errs.some(e => e.field === 'missionId'))
  })

  test('rejects negative missionId', () => {
    const errs = expectFail(schemas.missionCheckout, { missionId: -5 })
    assert.ok(errs.some(e => e.field === 'missionId'))
  })

  test('rejects float missionId', () => {
    const errs = expectFail(schemas.missionCheckout, { missionId: 1.5 })
    assert.ok(errs.some(e => e.field === 'missionId'))
  })

  test('rejects string missionId', () => {
    const errs = expectFail(schemas.missionCheckout, { missionId: '42' })
    assert.ok(errs.some(e => e.field === 'missionId'))
  })
})
