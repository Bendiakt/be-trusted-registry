/**
 * session.test.js — Unit tests for lib/session.js
 *
 * Tests the saveSession / getSession / clearSession helpers that store
 * non-secret user metadata in sessionStorage (replaces localStorage tokens).
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { saveSession, getSession, clearSession } from './session'

// sessionStorage is reset in test-setup.js afterEach; beforeEach here for clarity.
beforeEach(() => sessionStorage.clear())

// ── getSession ────────────────────────────────────────────────────────────────

describe('getSession — empty storage', () => {
  test('returns null when nothing stored', () => {
    expect(getSession()).toBeNull()
  })

  test('returns null when sessionStorage contains invalid JSON', () => {
    sessionStorage.setItem('mydd_user', '}{broken')
    expect(getSession()).toBeNull()
  })
})

// ── saveSession ───────────────────────────────────────────────────────────────

describe('saveSession — persists user metadata', () => {
  const user = { id: 42, name: 'Alice', email: 'alice@example.com', role: 'company' }

  test('getSession returns saved user after saveSession', () => {
    saveSession(user)
    expect(getSession()).not.toBeNull()
  })

  test('id is preserved', () => {
    saveSession(user)
    expect(getSession().id).toBe(42)
  })

  test('name is preserved', () => {
    saveSession(user)
    expect(getSession().name).toBe('Alice')
  })

  test('email is preserved', () => {
    saveSession(user)
    expect(getSession().email).toBe('alice@example.com')
  })

  test('role is preserved', () => {
    saveSession(user)
    expect(getSession().role).toBe('company')
  })

  test('only whitelisted fields are stored (no token leakage)', () => {
    saveSession({ ...user, token: 'secret', refreshToken: 'also-secret' })
    const stored = getSession()
    expect(stored.token).toBeUndefined()
    expect(stored.refreshToken).toBeUndefined()
  })

  test('missing name defaults to empty string', () => {
    saveSession({ id: 1, email: 'x@x.com', role: 'admin' })
    expect(getSession().name).toBe('')
  })

  test('missing email defaults to empty string', () => {
    saveSession({ id: 1, name: 'Bob', role: 'pac' })
    expect(getSession().email).toBe('')
  })

  test('missing role defaults to "company"', () => {
    saveSession({ id: 1, name: 'Carol', email: 'c@c.com' })
    expect(getSession().role).toBe('company')
  })
})

// ── clearSession ──────────────────────────────────────────────────────────────

describe('clearSession — removes session', () => {
  test('getSession returns null after clearSession', () => {
    saveSession({ id: 1, name: 'Dave', email: 'd@d.com', role: 'trader' })
    clearSession()
    expect(getSession()).toBeNull()
  })

  test('clearSession is safe to call when nothing is stored', () => {
    expect(() => clearSession()).not.toThrow()
  })
})

// ── round-trip ────────────────────────────────────────────────────────────────

describe('round-trip: save → clear → save again', () => {
  test('second save overwrites first', () => {
    saveSession({ id: 1, name: 'Eve', email: 'e@e.com', role: 'admin' })
    saveSession({ id: 2, name: 'Frank', email: 'f@f.com', role: 'pac' })
    expect(getSession().id).toBe(2)
    expect(getSession().name).toBe('Frank')
  })

  test('save after clear works correctly', () => {
    saveSession({ id: 10, name: 'Grace', email: 'g@g.com', role: 'company' })
    clearSession()
    saveSession({ id: 20, name: 'Heidi', email: 'h@h.com', role: 'trader' })
    const s = getSession()
    expect(s.id).toBe(20)
    expect(s.role).toBe('trader')
  })
})
