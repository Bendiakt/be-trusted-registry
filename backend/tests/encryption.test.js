'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// Provide a valid 64-hex ENCRYPTION_KEY before loading the module.
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

const { encrypt, decrypt, tokenize, hashForIntegrity } = require('../lib/encryption')

describe('hashForIntegrity', () => {
  test('returns a 64-char hex string', () => {
    const h = hashForIntegrity('hello')
    assert.match(h, /^[0-9a-f]{64}$/)
  })

  test('is deterministic for the same input', () => {
    assert.equal(hashForIntegrity('abc'), hashForIntegrity('abc'))
  })

  test('differs for different inputs', () => {
    assert.notEqual(hashForIntegrity('abc'), hashForIntegrity('ABC'))
  })

  test('accepts objects (JSON stringified)', () => {
    const h = hashForIntegrity({ key: 'value' })
    assert.match(h, /^[0-9a-f]{64}$/)
  })
})

describe('encrypt / decrypt', () => {
  test('round-trips plain text correctly', () => {
    const plaintext = 'sensitive data'
    const ciphertext = encrypt(plaintext)
    assert.equal(decrypt(ciphertext), plaintext)
  })

  test('each call produces a different ciphertext (random IV)', () => {
    const ct1 = encrypt('same')
    const ct2 = encrypt('same')
    assert.notEqual(ct1, ct2)
  })

  test('ciphertext has three dot-separated parts (iv.ct.tag)', () => {
    const parts = encrypt('test').split('.')
    assert.equal(parts.length, 3)
    assert.ok(parts.every(p => p.length > 0))
  })

  test('decrypt throws on tampered ciphertext', () => {
    const ct = encrypt('original')
    const parts = ct.split('.')
    // Flip the last hex digit of the ciphertext segment to a GUARANTEED-different
    // value. (Previously this overwrote it with 'ff', which was a no-op ~1/256 of
    // the time when the ciphertext already ended in 'ff' → flaky false pass.)
    const seg = parts[1]
    const last = seg.slice(-1)
    const flipped = last === '0' ? '1' : '0'
    const tampered = parts[0] + '.' + seg.slice(0, -1) + flipped + '.' + parts[2]
    assert.notEqual(tampered, ct) // sanity: we actually changed something
    assert.throws(() => decrypt(tampered))
  })

  test('decrypt throws on malformed input', () => {
    assert.throws(() => decrypt('notvalidformat'))
  })
})

describe('tokenize', () => {
  test('returns token and encrypted fields', () => {
    const { token, encrypted } = tokenize('user@example.com')
    assert.ok(token.length > 0)
    assert.ok(encrypted.length > 0)
  })

  test('token is deterministic for same input', () => {
    const t1 = tokenize('user@example.com').token
    const t2 = tokenize('user@example.com').token
    assert.equal(t1, t2)
  })

  test('token differs for different inputs', () => {
    const t1 = tokenize('alice@example.com').token
    const t2 = tokenize('bob@example.com').token
    assert.notEqual(t1, t2)
  })

  test('encrypted value decrypts back to original', () => {
    const pii = 'test-pii-value'
    const { encrypted } = tokenize(pii)
    assert.equal(decrypt(encrypted), pii)
  })
})
