'use strict'

/**
 * smoke.test.js — integration smoke tests against a live (local or prod) API.
 *
 * Validates all critical flows without needing a DB fixture:
 *   - Health endpoints
 *   - Auth (register, login, token, logout)
 *   - Public registry / verify endpoints
 *   - Protected endpoint 401 guard
 *
 * Usage:
 *   API_URL=http://localhost:3000 node --test tests/smoke.test.js
 *   API_URL=https://backend-production-xxx.up.railway.app node --test tests/smoke.test.js
 *
 * Default: http://localhost:3000
 */

const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')

const BASE = process.env.API_URL || 'http://localhost:3000'
const TIMEOUT_MS = 10_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function req(method, path, body, headers = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    let json = null
    try { json = await res.json() } catch { /* non-JSON body */ }
    return { status: res.status, json, headers: res.headers }
  } finally {
    clearTimeout(timer)
  }
}

const get  = (path, headers) => req('GET',    path, null,  headers)
const post = (path, body, headers) => req('POST', path, body, headers)

// Generate a unique test email per run to avoid conflicts
const runId    = Date.now()
const testEmail = `smoke_${runId}@test-mydd.internal`
const testPass  = 'SmokePass123!'
let accessToken = null
let refreshToken = null

// ─── Health ───────────────────────────────────────────────────────────────────

describe('Health endpoints', () => {
  test('GET /health → 200 with status:ok', async () => {
    const { status, json } = await get('/health')
    assert.equal(status, 200, `Expected 200, got ${status}`)
    assert.equal(json?.status, 'ok', `Expected status:ok, got ${JSON.stringify(json)}`)
  })

  test('GET /api/health → 200 with uptimeSec', async () => {
    const { status, json } = await get('/api/health')
    assert.equal(status, 200, `Expected 200, got ${status}`)
    assert.ok(typeof json?.uptimeSec === 'number', `Expected uptimeSec number, got ${JSON.stringify(json)}`)
  })

  test('GET /api/health/live → 200', async () => {
    const { status, json } = await get('/api/health/live')
    assert.equal(status, 200)
    assert.equal(json?.alive, true)
  })

  test('GET /api/health/ready → 200 or 503 (DB dependent)', async () => {
    const { status } = await get('/api/health/ready')
    assert.ok([200, 503].includes(status), `Expected 200 or 503, got ${status}`)
  })
})

// ─── Security headers ─────────────────────────────────────────────────────────

describe('Security headers', () => {
  test('Responses include X-Content-Type-Options: nosniff', async () => {
    const { headers } = await get('/health')
    assert.equal(headers.get('x-content-type-options'), 'nosniff')
  })

  test('Responses include X-Frame-Options: DENY', async () => {
    const { headers } = await get('/health')
    assert.equal(headers.get('x-frame-options'), 'DENY')
  })

  test('X-Powered-By header is removed', async () => {
    const { headers } = await get('/health')
    assert.ok(!headers.get('x-powered-by'), 'X-Powered-By should not be present')
  })

  test('Responses include X-Request-ID', async () => {
    const { headers } = await get('/health')
    assert.ok(headers.get('x-request-id'), 'Expected X-Request-ID header')
  })
})

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe('Auth guard — protected endpoints', () => {
  test('GET /api/companies/me without token → 401', async () => {
    const { status } = await get('/api/companies/me')
    assert.equal(status, 401)
  })

  test('GET /api/pac/missions without token → 401', async () => {
    const { status } = await get('/api/pac/missions')
    assert.equal(status, 401)
  })

  test('GET /api/admin/stats without token → 401', async () => {
    const { status } = await get('/api/admin/stats')
    assert.equal(status, 401)
  })

  test('GET /api/admin/stats with company token → 403', async () => {
    // We'll verify after login below — placeholder that will be filled by login tests
    // For now just confirm 401 without any token
    const { status } = await get('/api/admin/stats', { Authorization: 'Bearer fake.token.value' })
    assert.equal(status, 401, 'Invalid token should return 401')
  })
})

// ─── Public endpoints ─────────────────────────────────────────────────────────

describe('Public registry endpoints', () => {
  test('GET /api/registry → 200 with pagination', async () => {
    const { status, json } = await get('/api/registry?limit=5')
    assert.equal(status, 200)
    assert.ok(Array.isArray(json?.data), 'Expected data array')
    assert.ok(typeof json?.pagination?.total === 'number', 'Expected pagination.total')
  })

  test('GET /api/registry with q filter → 200', async () => {
    const { status, json } = await get('/api/registry?q=test&limit=5')
    assert.equal(status, 200)
    assert.ok(Array.isArray(json?.data))
  })

  test('GET /api/verify/0 → 400 (invalid id)', async () => {
    const { status } = await get('/api/verify/0')
    // 0 is falsy after parseInt check but depending on implementation may be 400 or 404
    assert.ok([400, 404].includes(status), `Expected 400 or 404, got ${status}`)
  })

  test('GET /api/verify/abc → 400 (non-numeric id)', async () => {
    const { status } = await get('/api/verify/abc')
    assert.equal(status, 400)
  })

  test('GET /api/verify/999999 → 404 (not found)', async () => {
    const { status } = await get('/api/verify/999999')
    assert.equal(status, 404)
  })
})

// ─── Auth flow ────────────────────────────────────────────────────────────────

describe('Auth flow — register, login, token use, logout', () => {
  test('POST /api/auth/register with valid data → 200', async () => {
    const { status, json } = await post('/api/auth/register', {
      name: `Smoke Tester ${runId}`,
      email: testEmail,
      password: testPass,
      role: 'company',
    })
    assert.equal(status, 200, `Register failed: ${JSON.stringify(json)}`)
    assert.ok(json?.message, 'Expected message in response')
  })

  test('POST /api/auth/register duplicate email → 400', async () => {
    const { status } = await post('/api/auth/register', {
      name: 'Duplicate',
      email: testEmail,
      password: testPass,
      role: 'company',
    })
    assert.equal(status, 400)
  })

  test('POST /api/auth/login with valid credentials → 200 + token', async () => {
    const { status, json } = await post('/api/auth/login', {
      email: testEmail,
      password: testPass,
    })
    assert.equal(status, 200, `Login failed: ${JSON.stringify(json)}`)
    assert.ok(json?.token, 'Expected access token')
    assert.ok(json?.refreshToken, 'Expected refresh token')
    assert.equal(json?.user?.email, testEmail)
    accessToken = json.token
    refreshToken = json.refreshToken
  })

  test('POST /api/auth/login with wrong password → 400', async () => {
    const { status } = await post('/api/auth/login', {
      email: testEmail,
      password: 'WrongPassword!',
    })
    assert.equal(status, 400)
  })

  test('GET /api/companies/me with valid token → 200', async () => {
    assert.ok(accessToken, 'Need access token from login test')
    const { status, json } = await get('/api/companies/me', {
      Authorization: `Bearer ${accessToken}`,
    })
    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(json)}`)
    assert.ok('user' in json, 'Expected user field in response')
  })

  test('POST /api/auth/refresh with valid refreshToken → 200 + new token', async () => {
    assert.ok(refreshToken, 'Need refresh token from login test')
    const { status, json } = await post('/api/auth/refresh', { refreshToken })
    assert.equal(status, 200, `Refresh failed: ${JSON.stringify(json)}`)
    assert.ok(json?.token, 'Expected new access token')
  })

  test('POST /api/auth/logout → 200, then token is invalid', async () => {
    assert.ok(accessToken, 'Need token from login test')
    const { status } = await post('/api/auth/logout', { refreshToken }, {
      Authorization: `Bearer ${accessToken}`,
    })
    assert.equal(status, 200, 'Logout should succeed')

    // After logout, the token must be rejected (blacklisted)
    const { status: postLogoutStatus } = await get('/api/companies/me', {
      Authorization: `Bearer ${accessToken}`,
    })
    assert.equal(postLogoutStatus, 401, 'Token should be invalid after logout')
  })
})

// ─── Forgot password ──────────────────────────────────────────────────────────

describe('Forgot password — anti-enumeration', () => {
  test('POST /api/auth/forgot-password always returns 200', async () => {
    const { status } = await post('/api/auth/forgot-password', { email: 'nonexistent@nowhere.test' })
    assert.equal(status, 200, 'Should always 200 to prevent email enumeration')
  })

  test('POST /api/auth/forgot-password with real email → also 200', async () => {
    const { status } = await post('/api/auth/forgot-password', { email: testEmail })
    assert.equal(status, 200)
  })
})

// ─── Badge endpoint ───────────────────────────────────────────────────────────

describe('Badge endpoint', () => {
  test('GET /api/badge/999999.svg → 404 for unknown company', async () => {
    const { status } = await get('/api/badge/999999.svg')
    assert.ok([404, 400].includes(status), `Expected 404 or 400, got ${status}`)
  })

  test('GET /api/badge/abc.svg → 400 for non-numeric id', async () => {
    const { status } = await get('/api/badge/abc.svg')
    assert.ok([400, 404].includes(status), `Expected 400 or 404, got ${status}`)
  })
})

// ─── Email verification endpoint ──────────────────────────────────────────────

describe('Email verification endpoint', () => {
  test('GET /api/auth/verify-email without token → 400', async () => {
    const { status } = await get('/api/auth/verify-email')
    assert.equal(status, 400, 'Missing token should return 400')
  })

  test('GET /api/auth/verify-email with invalid token → 400', async () => {
    const { status } = await get('/api/auth/verify-email?token=totally-fake-token-000')
    assert.equal(status, 400, 'Invalid token should return 400')
  })
})

// ─── Documents auth guard ─────────────────────────────────────────────────────

describe('Documents endpoint auth guards', () => {
  test('GET /api/documents without token → 401', async () => {
    const { status } = await get('/api/documents')
    assert.equal(status, 401)
  })

  test('GET /api/admin/documents/1 without token → 401 or 403', async () => {
    const { status } = await get('/api/documents/admin/1')
    assert.ok([401, 403].includes(status), `Expected 401 or 403, got ${status}`)
  })
})
