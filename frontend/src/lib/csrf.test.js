/**
 * csrf.test.js — Unit tests for lib/csrf.js CSRF token reader.
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { getCsrfToken } from './csrf'

beforeEach(() => {
  // Clear all cookies before each test
  document.cookie.split(';').forEach(c => {
    document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/'
  })
})

describe('getCsrfToken — no cookie', () => {
  test('returns null when no cookies are set', () => {
    expect(getCsrfToken()).toBeNull()
  })

  test('returns null when other cookies exist but not csrf_token', () => {
    document.cookie = 'session=abc123'
    expect(getCsrfToken()).toBeNull()
  })
})

describe('getCsrfToken — with csrf_token cookie', () => {
  test('returns the token value when csrf_token is set', () => {
    document.cookie = 'csrf_token=mytoken123'
    expect(getCsrfToken()).toBe('mytoken123')
  })

  test('returns the token when csrf_token is not the first cookie', () => {
    document.cookie = 'other=val'
    document.cookie = 'csrf_token=abc'
    expect(getCsrfToken()).toBe('abc')
  })

  test('decodes URL-encoded token values', () => {
    document.cookie = 'csrf_token=' + encodeURIComponent('tok/en+val=')
    expect(getCsrfToken()).toBe('tok/en+val=')
  })

  test('handles hex token format (32 bytes)', () => {
    const hex = 'a'.repeat(64)
    document.cookie = `csrf_token=${hex}`
    expect(getCsrfToken()).toBe(hex)
  })
})
