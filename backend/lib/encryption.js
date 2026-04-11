'use strict'

const crypto = require('crypto')

const ALGO = 'aes-256-gcm'

const getKey = () => {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns "ivHex.ctHex.tagHex"
 */
const encrypt = (plaintext) => {
  const key = getKey()
  const iv = crypto.randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${ct.toString('hex')}.${tag.toString('hex')}`
}

/**
 * Decrypt a string produced by encrypt().
 */
const decrypt = (ciphertext) => {
  const key = getKey()
  const parts = ciphertext.split('.')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, ctHex, tagHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const ct = Buffer.from(ctHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/**
 * Pseudonymise PII: returns a stable HMAC token + encrypted copy.
 * The token is deterministic for the same input — safe to use as a lookup key.
 */
const tokenize = (pii) => {
  const key = getKey()
  const hmac = crypto.createHmac('sha256', key)
  hmac.update(String(pii))
  const token = hmac.digest('hex').slice(0, 32) // 128-bit token
  const encrypted = encrypt(String(pii))
  return { token, encrypted }
}

/**
 * SHA-256 hash for payload integrity checks (used in audit_log).
 */
const hashForIntegrity = (data) => {
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  return crypto.createHash('sha256').update(str).digest('hex')
}

module.exports = { encrypt, decrypt, tokenize, hashForIntegrity }
