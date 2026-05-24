'use strict'

/**
 * API Key management routes — protected by JWT auth (company role).
 *
 * POST   /api/keys            Create a new API key (raw shown once)
 * GET    /api/keys            List current user's keys (no raw key)
 * DELETE /api/keys/:id        Revoke a key
 */

const { Router }    = require('express')
const { auth }      = require('../lib/auth')
const { validate, schemas } = require('../lib/validators')
const { createKey, listKeys, revokeKey } = require('../lib/apiKeyAuth')
const { logAudit }  = require('../lib/audit')
const { AUDIT }     = require('../lib/auditActions')
const { makeRateLimiter } = require('../lib/rateLimiter')
const { z }         = require('zod')

const router  = Router()

const createKeyLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      10,
  message:  { error: 'Too many API key creation requests' },
  _prefix:  'rl:apikeys:create',
})

// ── POST /api/keys — create ────────────────────────────────────────────────────
router.post('/', auth, createKeyLimiter, async (req, res) => {
  const parsed = z.object({
    name:      z.string().min(1).max(80),
    scopes:    z.array(z.string()).optional(),
    rateLimit: z.number().int().min(1).max(600).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
  }).safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' })
  }

  const userId = req.user.id
  const keyData = await createKey(userId, parsed.data)

  await logAudit(userId, AUDIT.API_KEY_CREATED, 'api_keys', req.ip, {
    keyId:  keyData.id,
    prefix: keyData.prefix,
    scopes: keyData.scopes,
  })

  // raw is returned ONLY here — never stored, never shown again
  res.status(201).json({
    id:         keyData.id,
    prefix:     keyData.prefix,
    name:       keyData.name,
    scopes:     keyData.scopes,
    rateLimit:  keyData.rate_limit,
    createdAt:  keyData.created_at,
    key:        keyData.raw,  // ← only occurrence
  })
})

// ── GET /api/keys — list ───────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const keys = await listKeys(req.user.id)
  res.json({ data: keys })
})

// ── DELETE /api/keys/:id — revoke ─────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const keyId = parseInt(req.params.id, 10)
  if (!keyId) return res.status(400).json({ error: 'Invalid key id' })

  const revoked = await revokeKey(req.user.id, keyId)
  if (!revoked) return res.status(404).json({ error: 'Key not found' })

  await logAudit(req.user.id, AUDIT.API_KEY_REVOKED, 'api_keys', req.ip, { keyId })
  res.json({ success: true })
})

module.exports = router
