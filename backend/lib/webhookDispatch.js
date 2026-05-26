'use strict'

/**
 * lib/webhookDispatch.js — Certified webhook delivery with HMAC signing.
 *
 * Usage:
 *   const { dispatchWebhook } = require('./webhookDispatch')
 *   await dispatchWebhook('cert.status_changed', { companyId, level, status })
 *
 * Security:
 *   Every request is signed:  X-MyDD-Signature: sha256=<HMAC-SHA256(body, secret)>
 *   Partners verify the signature server-side before processing.
 *
 * Retry policy (fire-and-forget after first delivery attempt):
 *   Attempts: 1 → 2 → 3 → 4 → 5
 *   Back-off:   30 s → 60 s → 120 s → 300 s → 600 s
 */

const crypto = require('crypto')
const https  = require('https')
const http   = require('http')
const { query } = require('../db')

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000]  // 5 attempts total
const TIMEOUT_MS = 10_000  // 10 s per request

// ── HMAC signing ───────────────────────────────────────────────────────────────

const signPayload = (body, secret) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

// ── Low-level HTTP POST ────────────────────────────────────────────────────────

const postWithTimeout = (url, body, headers) => new Promise((resolve, reject) => {
  const parsed   = new URL(url)
  const lib      = parsed.protocol === 'https:' ? https : http
  const reqOpts  = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   'POST',
    headers,
  }
  const req = lib.request(reqOpts, (res) => {
    let buf = ''
    res.on('data', (chunk) => { if (buf.length < 500) buf += chunk })
    res.on('end', () => resolve({ statusCode: res.statusCode, body: buf.slice(0, 500) }))
  })
  req.setTimeout(TIMEOUT_MS, () => { req.destroy(new Error('Request timeout')) })
  req.on('error', reject)
  req.write(body)
  req.end()
})

// ── Single attempt ─────────────────────────────────────────────────────────────

const attemptDelivery = async (endpoint, eventType, payload, attempt) => {
  const body      = JSON.stringify({ event: eventType, ...payload, delivered_at: new Date().toISOString() })
  const signature = signPayload(body, endpoint.secret)
  const headers   = {
    'Content-Type':     'application/json',
    'Content-Length':   Buffer.byteLength(body),
    'X-MyDD-Signature': signature,
    'X-MyDD-Event':     eventType,
    'X-MyDD-Attempt':   String(attempt),
    'User-Agent':       'MyDD-Webhook/1.0',
  }

  let statusCode = null
  let responseBody = null
  let success = false
  let errorMessage = null

  try {
    const result = await postWithTimeout(endpoint.url, body, headers)
    statusCode   = result.statusCode
    responseBody = result.body
    success      = statusCode >= 200 && statusCode < 300
  } catch (err) {
    errorMessage = err.message
  }

  // Log delivery attempt
  await query(
    `INSERT INTO webhook_deliveries
       (endpoint_id, event_type, payload, attempt, status_code, response_body, success, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      endpoint.id,
      eventType,
      JSON.parse(body),
      attempt,
      statusCode,
      responseBody,
      success,
      errorMessage,
    ]
  ).catch(() => { /* non-fatal */ })

  return success
}

// ── Retry loop (fire-and-forget) ───────────────────────────────────────────────

const deliverWithRetry = async (endpoint, eventType, payload) => {
  for (let i = 0; i < RETRY_DELAYS_MS.length + 1; i++) {
    const success = await attemptDelivery(endpoint, eventType, payload, i + 1)
    if (success) return

    const delay = RETRY_DELAYS_MS[i]
    if (delay === undefined) break  // exhausted retries

    await new Promise((r) => setTimeout(r, delay))
  }

  // Mark endpoint as potentially unreachable after 5 failures
  query(
    `UPDATE webhook_endpoints SET active = FALSE WHERE id = $1`,
    [endpoint.id]
  ).catch(() => { /* non-fatal */ })

  console.warn(JSON.stringify({
    event:      'webhook.endpoint_deactivated',
    endpointId: endpoint.id,
    eventType,
    reason:     'exhausted 5 delivery attempts',
  }))
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fan out an event to all active registered endpoints that subscribe to it.
 * Returns immediately — delivery is fully async (fire-and-forget).
 *
 * @param {string} eventType  e.g. 'cert.status_changed'
 * @param {object} payload    arbitrary JSON-serialisable object
 */
const dispatchWebhook = (eventType, payload) => {
  // Load endpoints and start delivery without blocking the caller
  query(
    `SELECT id, url, secret FROM webhook_endpoints
      WHERE active = TRUE AND events @> $1::jsonb`,
    [JSON.stringify([eventType])]
  ).then(({ rows: endpoints }) => {
    for (const ep of endpoints) {
      deliverWithRetry(ep, eventType, payload).catch(() => { /* already logged */ })
    }
  }).catch((err) => {
    console.error(JSON.stringify({ event: 'webhook.lookup_error', err: err.message }))
  })
}

/**
 * Send a single test ping to an endpoint and return the result.
 * Unlike dispatchWebhook, this is synchronous and returns immediately.
 *
 * @param {{ id, url, secret }} endpoint
 * @returns {{ success: boolean, statusCode: number|null, error: string|null }}
 */
const pingEndpoint = async (endpoint) => {
  const body      = JSON.stringify({ event: 'ping', message: 'MyDD webhook test', delivered_at: new Date().toISOString() })
  const signature = signPayload(body, endpoint.secret)
  const headers   = {
    'Content-Type':     'application/json',
    'Content-Length':   Buffer.byteLength(body),
    'X-MyDD-Signature': signature,
    'X-MyDD-Event':     'ping',
    'X-MyDD-Attempt':   '1',
    'User-Agent':       'MyDD-Webhook/1.0',
  }

  try {
    const result = await postWithTimeout(endpoint.url, body, headers)
    const success = result.statusCode >= 200 && result.statusCode < 300
    // Log delivery attempt
    await query(
      `INSERT INTO webhook_deliveries
         (endpoint_id, event_type, payload, attempt, status_code, response_body, success)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [endpoint.id, 'ping', JSON.parse(body), 1, result.statusCode, result.body?.slice(0, 500) || null, success]
    ).catch(() => { /* non-fatal */ })
    return { success, statusCode: result.statusCode, error: null }
  } catch (err) {
    return { success: false, statusCode: null, error: err.message }
  }
}

module.exports = { dispatchWebhook, signPayload, pingEndpoint }
