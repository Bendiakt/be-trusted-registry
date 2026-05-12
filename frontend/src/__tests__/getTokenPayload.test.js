/**
 * Pure unit tests for the JWT-payload parser used in App.jsx.
 * No DOM or React needed — keeps the suite fast.
 *
 * We duplicate the helper here so we can test it without importing the full
 * App (which needs a router context). In future, extract it to src/lib/auth.js
 * and import from there.
 */

function makeJwt(payload) {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '')
  const body    = btoa(JSON.stringify(payload)).replace(/=+$/, '')
  return `${header}.${body}.fakesig`
}

function getTokenPayload(token) {
  try {
    if (!token) return null
    const base64 = token.split('.')[1]
    if (!base64) return null
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json)
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

describe('getTokenPayload', () => {
  it('returns null for missing token', () => {
    expect(getTokenPayload(null)).toBeNull()
    expect(getTokenPayload('')).toBeNull()
    expect(getTokenPayload(undefined)).toBeNull()
  })

  it('returns null for a malformed token', () => {
    expect(getTokenPayload('not.a.jwt')).toBeNull()
    expect(getTokenPayload('only_one_part')).toBeNull()
  })

  it('returns the decoded payload for a valid non-expired token', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600 // 1h from now
    const jwt = makeJwt({ id: 42, role: 'admin', exp })
    const payload = getTokenPayload(jwt)
    expect(payload).not.toBeNull()
    expect(payload.id).toBe(42)
    expect(payload.role).toBe('admin')
  })

  it('returns null for an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 1 // 1 second ago
    const jwt = makeJwt({ id: 1, role: 'company', exp })
    expect(getTokenPayload(jwt)).toBeNull()
  })

  it('handles tokens without exp (never-expiring legacy tokens)', () => {
    const jwt = makeJwt({ id: 7, role: 'pac' })
    const payload = getTokenPayload(jwt)
    expect(payload).not.toBeNull()
    expect(payload.role).toBe('pac')
  })
})
