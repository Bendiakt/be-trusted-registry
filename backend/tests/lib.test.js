'use strict'
/**
 * tests/lib.test.js — Unit tests for pure-logic library modules.
 *
 * Covers:
 *   - lib/blocklist.js   (isBlockedCompany, normalize, blocklistedCompanyMiddleware)
 *   - lib/auditActions.js (AUDIT constants integrity)
 *   - lib/wsNotify.js    (notifyUser with mock WebSocket clients)
 *
 * No database, no network, no environment variables required.
 *
 * Run: node --test tests/lib.test.js
 */

const { test, describe } = require('node:test')
const assert             = require('node:assert/strict')

// ── lib/blocklist.js ──────────────────────────────────────────────────────────

const {
  isBlockedCompany,
  normalize,
  blocklistedCompanyMiddleware,
} = require('../lib/blocklist')

describe('normalize — strips legal suffixes', () => {
  test('strips FZCO suffix', () =>
    assert.equal(normalize('B&E Consult FZCO'), 'b&e consult'))

  test('strips LTD suffix', () =>
    assert.equal(normalize('ACME Ltd'), 'acme'))

  test('strips LLC suffix', () =>
    assert.equal(normalize('Acme LLC'), 'acme'))

  test('strips SARL suffix', () =>
    assert.equal(normalize('Acme SARL'), 'acme'))

  test('strips GmbH suffix', () =>
    assert.equal(normalize('Acme GmbH'), 'acme'))

  test('collapses extra whitespace and trims', () =>
    assert.equal(normalize('  Acme   Corp  '), 'acme corp'))

  test('lowercases', () =>
    assert.equal(normalize('ACME'), 'acme'))

  test('empty string returns empty', () =>
    assert.equal(normalize(''), ''))

  test('null returns empty', () =>
    assert.equal(normalize(null), ''))
})

describe('isBlockedCompany — core variants', () => {
  // All these should be blocked
  const blocked = [
    'B&E Consult',
    'B&E Consult FZCO',
    'B & E Consult',
    'B and E Consult',
    'b-e consult',
    'be consult',
    'B&E Consult Ltd',
    'BE Consult',
    'B&E CONSULT FZCO',
    'b&econsult',         // no space — matches be\s*consult
  ]

  for (const name of blocked) {
    test(`blocks "${name}"`, () =>
      assert.equal(isBlockedCompany(name), true))
  }
})

describe('isBlockedCompany — legitimate names are not blocked', () => {
  const allowed = [
    'Acme Corp',
    'B2B Consulting',
    'Better Consult',
    'Belmont Consulting',
    'ABC Ltd',
    'Global Consult',
    '',
    null,
  ]

  for (const name of allowed) {
    test(`allows ${JSON.stringify(name)}`, () =>
      assert.equal(isBlockedCompany(name), false))
  }
})

describe('blocklistedCompanyMiddleware — checks body fields', () => {
  const middleware = blocklistedCompanyMiddleware()

  function makeReqRes(body) {
    let status = null
    let json   = null
    const res = {
      status (s) { status = s; return this },
      json   (j) { json   = j; return this },
    }
    return { req: { body }, res, getStatus: () => status, getJson: () => json }
  }

  test('blocks when body.name is blocked', (t, done) => {
    const { req, res, getStatus } = makeReqRes({ name: 'B&E Consult' })
    middleware(req, res, () => { assert.fail('next() should not be called') })
    assert.equal(getStatus(), 403)
    done()
  })

  test('blocks when body.companyName is blocked', (t, done) => {
    const { req, res, getStatus } = makeReqRes({ companyName: 'B&E Consult FZCO' })
    middleware(req, res, () => { assert.fail('next() should not be called') })
    assert.equal(getStatus(), 403)
    done()
  })

  test('blocks when body.company_name is blocked', (t, done) => {
    const { req, res, getStatus } = makeReqRes({ company_name: 'BE Consult Ltd' })
    middleware(req, res, () => { assert.fail('next() should not be called') })
    assert.equal(getStatus(), 403)
    done()
  })

  test('calls next() for an allowed company name', (t, done) => {
    const { req, res } = makeReqRes({ name: 'Acme Corp' })
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    done()
  })

  test('calls next() when body has no name fields', (t, done) => {
    const { req, res } = makeReqRes({})
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    done()
  })

  test('uses custom error message when provided', (t, done) => {
    const custom = blocklistedCompanyMiddleware('Custom error')
    const { req, res, getJson } = makeReqRes({ name: 'B&E Consult' })
    custom(req, res, () => {})
    assert.equal(getJson().error, 'Custom error')
    done()
  })
})

// ── lib/auditActions.js ───────────────────────────────────────────────────────

const { AUDIT } = require('../lib/auditActions')

describe('AUDIT — object is frozen', () => {
  test('Object.isFrozen(AUDIT) is true', () =>
    assert.equal(Object.isFrozen(AUDIT), true))

  test('adding a new key does not throw but is silently ignored', () => {
    // Strict-mode assignment on a frozen object throws TypeError in modules
    // with 'use strict'. We just verify the key is not persisted.
    try { AUDIT.NEW_KEY = 'new' } catch { /* expected in strict mode */ }
    assert.equal(AUDIT.NEW_KEY, undefined)
  })
})

describe('AUDIT — every constant is a non-empty string', () => {
  for (const [key, value] of Object.entries(AUDIT)) {
    test(`AUDIT.${key} is a non-empty string`, () => {
      assert.equal(typeof value, 'string')
      assert.ok(value.length > 0, `${key} is empty`)
    })
  }
})

describe('AUDIT — constant values match expected strings', () => {
  // Spot-check the most critical action names used in auth flows.
  // If someone renames a value, these tests catch the regression.
  const cases = [
    ['USER_REGISTER',         'user_register'],
    ['USER_LOGIN',            'user_login'],
    ['LOGIN_FAILED',          'login_failed'],
    ['LOGIN_BLOCKED_LOCKOUT', 'login_blocked_lockout'],
    ['LOGIN_2FA_REQUIRED',    'login_2fa_required'],
    ['LOGIN_2FA_SUCCESS',     'login_2fa_success'],
    ['EMAIL_VERIFIED',        'email_verified'],
    ['RESEND_VERIFY_PUBLIC',  'resend_verify_public'],
    ['PASSWORD_RESET',        'password_reset'],
    ['PROFILE_UPDATE',        'profile_update'],
    ['TOTP_ENABLED',          'totp_enabled'],
    ['TOTP_DISABLED',         'totp_disabled'],
    ['USER_DATA_EXPORT',           'user_data_export'],
    ['USER_ACCOUNT_DELETED',       'user_account_deleted'],
    ['ADMIN_DELETE_USER',          'admin_delete_user'],
    ['ADMIN_SET_CERT_LEVEL',       'admin_set_cert_level'],
    ['USER_LOGOUT',                'user_logout'],
    ['PASSWORD_RESET_REQUEST',     'password_reset_request'],
    ['WATCHLIST_ADD',              'watchlist_add'],
    ['WATCHLIST_REMOVE',           'watchlist_remove'],
  ]

  for (const [key, expected] of cases) {
    test(`AUDIT.${key} === '${expected}'`, () =>
      assert.equal(AUDIT[key], expected))
  }
})

describe('AUDIT — no duplicate values', () => {
  test('all action strings are unique', () => {
    const values = Object.values(AUDIT)
    const unique  = new Set(values)
    assert.equal(unique.size, values.length,
      `Duplicate values found: ${values.filter((v, i) => values.indexOf(v) !== i).join(', ')}`)
  })
})

// ── lib/wsNotify.js ───────────────────────────────────────────────────────────
// Import fresh after each describe by resetting the module-level Map between
// describe blocks. Since require() caches modules we manipulate the Map directly.

const { userWsClients, notifyUser } = require('../lib/wsNotify')

// Helper: make a mock WebSocket client
function mockWs(readyState = 1) {
  const sent = []
  return {
    readyState,
    send (msg) { sent.push(msg) },
    getSent () { return sent },
  }
}

describe('notifyUser — sends to connected client', () => {
  test('delivers JSON payload to open socket', () => {
    const ws = mockWs(1) // readyState 1 = OPEN
    userWsClients.set(100, new Set([ws]))

    notifyUser(100, { type: 'notification', message: 'hello' })

    assert.equal(ws.getSent().length, 1)
    const parsed = JSON.parse(ws.getSent()[0])
    assert.equal(parsed.type, 'notification')
    assert.equal(parsed.message, 'hello')

    userWsClients.delete(100)
  })

  test('coerces string userId to number', () => {
    const ws = mockWs(1)
    userWsClients.set(200, new Set([ws]))

    notifyUser('200', { type: 'ping' })  // string '200'

    assert.equal(ws.getSent().length, 1)
    userWsClients.delete(200)
  })

  test('sends to all sockets for the same user', () => {
    const ws1 = mockWs(1)
    const ws2 = mockWs(1)
    userWsClients.set(300, new Set([ws1, ws2]))

    notifyUser(300, { type: 'broadcast' })

    assert.equal(ws1.getSent().length, 1)
    assert.equal(ws2.getSent().length, 1)
    userWsClients.delete(300)
  })
})

describe('notifyUser — skips closed or unknown clients', () => {
  test('does not send when readyState !== 1 (CLOSING = 2)', () => {
    const ws = mockWs(2) // CLOSING
    userWsClients.set(400, new Set([ws]))

    notifyUser(400, { type: 'test' })

    assert.equal(ws.getSent().length, 0)
    userWsClients.delete(400)
  })

  test('does not send when readyState === 0 (CONNECTING)', () => {
    const ws = mockWs(0)
    userWsClients.set(500, new Set([ws]))

    notifyUser(500, { type: 'test' })

    assert.equal(ws.getSent().length, 0)
    userWsClients.delete(500)
  })

  test('silently does nothing for unknown userId', () => {
    // Should not throw
    assert.doesNotThrow(() => notifyUser(99999, { type: 'ghost' }))
  })

  test('silently does nothing when userId has no clients', () => {
    userWsClients.set(600, new Set()) // empty set

    assert.doesNotThrow(() => notifyUser(600, { type: 'empty' }))
    userWsClients.delete(600)
  })
})

describe('notifyUser — payload is JSON-serialized correctly', () => {
  test('nested objects are preserved', () => {
    const ws = mockWs(1)
    userWsClients.set(700, new Set([ws]))

    notifyUser(700, { type: 'update', data: { id: 1, name: 'Test', nested: { ok: true } } })

    const parsed = JSON.parse(ws.getSent()[0])
    assert.equal(parsed.data.nested.ok, true)
    userWsClients.delete(700)
  })

  test('arrays in payload survive serialization', () => {
    const ws = mockWs(1)
    userWsClients.set(800, new Set([ws]))

    notifyUser(800, { type: 'list', items: [1, 2, 3] })

    const parsed = JSON.parse(ws.getSent()[0])
    assert.deepEqual(parsed.items, [1, 2, 3])
    userWsClients.delete(800)
  })
})
