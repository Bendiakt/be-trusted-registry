'use strict'

/**
 * Webhook endpoint management — protected by JWT auth (company role).
 *
 * POST   /api/webhooks          Register a new endpoint
 * GET    /api/webhooks          List current user's endpoints
 * DELETE /api/webhooks/:id      Delete an endpoint
 * POST   /api/webhooks/:id/ping Test-fire a ping event to the endpoint
 *
 * The signing secret is generated server-side and shown ONCE (same pattern
 * as API keys). Partners must store it immediately.
 */

const { Router } = require('express')
const crypto     = require('crypto')
const { z }      = require('zod')
const { auth }   = require('../lib/auth')
const { query }  = require('../db')
const { logAudit } = require('../lib/audit')
const { AUDIT }    = require('../lib/auditActions')
const { makeRateLimiter } = require('../lib/rateLimiter')
const { dispatchWebhook, signPayload } = require('../lib/webhookDispatch')

const router = Router()

const createLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  { error: 'Too many webhook registration requests' },
  _prefix:  'rl:webhooks:create',
})

const ALLOWED_EVENTS = ['cert.status_changed', 'cert.issued', 'cert.expired', 'cert.revoked']

// ── POST /api/webhooks — register ─────────────────────────────────────────────
router.post('/', auth, createLimiter, async (req, res) => {
  const parsed = z.object({
    url:         z.string().url().max(500).refine(u => u.startsWith('https://'), {
      message: 'Webhook URL must use HTTPS',
    }),
    events:      z.array(z.enum(ALLOWED_EVENTS)).min(1).optional(),
    description: z.string().max(200).optional().nullable(),
  }).safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' })
  }

  const { url, events = ['cert.status_changed'], description } = parsed.data
  const secret = crypto.randomBytes(32).toString('hex')  // shown ONCE

  const result = await query(
    `INSERT INTO webhook_endpoints (user_id, url, secret, events, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, url, events, active, description, created_at`,
    [req.user.id, url, secret, JSON.stringify(events), description || null]
  )

  await logAudit(req.user.id, AUDIT.WEBHOOK_CREATED, 'webhook_endpoints', req.ip, {
    endpointId: result.rows[0].id,
    url,
    events,
  })

  res.status(201).json({
    ...result.rows[0],
    secret,  // ← only occurrence — store immediately
  })
})

// ── GET /api/webhooks — list ──────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const result = await query(
    `SELECT id, url, events, active, description, created_at,
            (SELECT COUNT(*) FROM webhook_deliveries WHERE endpoint_id = webhook_endpoints.id) AS deliveries_total,
            (SELECT COUNT(*) FROM webhook_deliveries WHERE endpoint_id = webhook_endpoints.id AND success = TRUE) AS deliveries_success
       FROM webhook_endpoints
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [req.user.id]
  )
  res.json({ data: result.rows })
})

// ── DELETE /api/webhooks/:id — delete ─────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: 'Invalid id' })

  const result = await query(
    `DELETE FROM webhook_endpoints WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, req.user.id]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Endpoint not found' })

  await logAudit(req.user.id, AUDIT.WEBHOOK_DELETED, 'webhook_endpoints', req.ip, { endpointId: id })
  res.json({ success: true })
})

// ── POST /api/webhooks/:id/ping — test delivery ───────────────────────────────
router.post('/:id/ping', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ error: 'Invalid id' })

  const ep = await query(
    `SELECT id, url, secret FROM webhook_endpoints WHERE id = $1 AND user_id = $2 AND active = TRUE`,
    [id, req.user.id]
  )
  if (!ep.rows.length) return res.status(404).json({ error: 'Endpoint not found or inactive' })

  const payload = JSON.stringify({ event: 'ping', message: 'MyDD webhook test', sent_at: new Date().toISOString() })
  const signature = signPayload(payload, ep.rows[0].secret)

  res.json({
    url:       ep.rows[0].url,
    signature,
    payload:   JSON.parse(payload),
    note:      'Verify X-MyDD-Signature on your end using the stored secret.',
  })
})

module.exports = router
