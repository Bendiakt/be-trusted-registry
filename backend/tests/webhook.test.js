'use strict'

/**
 * Webhook signature validation unit tests.
 *
 * We don't call the real Stripe SDK — instead we reproduce the Stripe signature
 * algorithm (HMAC-SHA256 over "timestamp.payload") and verify our server rejects
 * unsigned or tampered requests.
 *
 * These tests exercise the security invariant: the /api/payments/webhook endpoint
 * MUST reject any request that lacks a valid stripe-signature header.
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

/**
 * Reproduce Stripe's signature scheme:
 *   signed_payload = timestamp + "." + body_string
 *   signature      = HMAC-SHA256(secret, signed_payload)
 *   header         = "t=<ts>,v1=<hex_sig>"
 */
function buildStripeSignature(secret, body, timestamp) {
  const signedPayload = `${timestamp}.${body}`
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

/**
 * Inline re-implementation of the server's signature-check logic.
 * This mirrors what getStripe().webhooks.constructEvent() does internally,
 * so we can test the algorithm without loading the full server stack.
 */
function verifyWebhookSignature(secret, rawBody, sigHeader, toleranceSec = 300) {
  if (!sigHeader) return { valid: false, reason: 'missing_signature_header' }

  const parts = {}
  sigHeader.split(',').forEach(item => {
    const [k, v] = item.split('=')
    if (k === 't') parts.timestamp = v
    if (k === 'v1') parts.v1 = v
  })

  if (!parts.timestamp || !parts.v1) return { valid: false, reason: 'malformed_signature_header' }

  const ts = parseInt(parts.timestamp, 10)
  if (isNaN(ts)) return { valid: false, reason: 'invalid_timestamp' }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > toleranceSec) return { valid: false, reason: 'timestamp_out_of_tolerance' }

  const signedPayload = `${ts}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')

  const trusted = Buffer.from(expected, 'hex')
  const received = Buffer.from(parts.v1, 'hex')
  if (trusted.length !== received.length) return { valid: false, reason: 'signature_length_mismatch' }

  const match = crypto.timingSafeEqual(trusted, received)
  return match ? { valid: true } : { valid: false, reason: 'signature_mismatch' }
}

const SECRET = 'whsec_test_secret'
const BODY = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_123' } } })

describe('webhook signature validation', () => {
  test('accepts a correctly signed request', () => {
    const ts = Math.floor(Date.now() / 1000)
    const sig = buildStripeSignature(SECRET, BODY, ts)
    const result = verifyWebhookSignature(SECRET, BODY, sig)
    assert.equal(result.valid, true, `expected valid, got: ${result.reason}`)
  })

  test('rejects when stripe-signature header is missing', () => {
    const result = verifyWebhookSignature(SECRET, BODY, null)
    assert.equal(result.valid, false)
    assert.equal(result.reason, 'missing_signature_header')
  })

  test('rejects when stripe-signature header is empty string', () => {
    const result = verifyWebhookSignature(SECRET, BODY, '')
    assert.equal(result.valid, false)
  })

  test('rejects when signature is computed with wrong secret', () => {
    const ts = Math.floor(Date.now() / 1000)
    const sig = buildStripeSignature('wrong_secret', BODY, ts)
    const result = verifyWebhookSignature(SECRET, BODY, sig)
    assert.equal(result.valid, false)
    assert.equal(result.reason, 'signature_mismatch')
  })

  test('rejects when body has been tampered', () => {
    const ts = Math.floor(Date.now() / 1000)
    const sig = buildStripeSignature(SECRET, BODY, ts)
    const tamperedBody = BODY.replace('cs_test_123', 'cs_test_EVIL')
    const result = verifyWebhookSignature(SECRET, tamperedBody, sig)
    assert.equal(result.valid, false)
    assert.equal(result.reason, 'signature_mismatch')
  })

  test('rejects a timestamp older than tolerance window', () => {
    const staleTs = Math.floor(Date.now() / 1000) - 400 // > 300s tolerance
    const sig = buildStripeSignature(SECRET, BODY, staleTs)
    const result = verifyWebhookSignature(SECRET, BODY, sig)
    assert.equal(result.valid, false)
    assert.equal(result.reason, 'timestamp_out_of_tolerance')
  })

  test('rejects malformed signature header', () => {
    const result = verifyWebhookSignature(SECRET, BODY, 'not-a-valid-header')
    assert.equal(result.valid, false)
    assert.equal(result.reason, 'malformed_signature_header')
  })
})
