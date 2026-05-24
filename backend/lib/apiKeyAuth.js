'use strict'

/**
 * API Key authentication middleware + key management utilities.
 *
 * Keys are issued as:  mydd_<env>k_<32-bytes-hex>
 *   prefix: first 12 chars  →  stored in api_keys.prefix (for UI display)
 *   full:   stored NOWHERE  →  only SHA-256(full) is persisted
 *
 * Usage metering is fire-and-forget (no await) to keep p99 latency unaffected.
 *
 * Scopes enforced:
 *   registry:read   – GET /api/registry, GET /api/verify/:id
 *   verify:read     – GET /api/verify/:id  (alias, subset of registry:read)
 *   company:read    – GET /api/companies/:id
 *   company:write   – POST/PATCH on company endpoints
 *   admin           – full access (internal use only)
 */

const crypto      = require('crypto')
const { query }   = require('../db')
const { AUDIT }   = require('./auditActions')
const { logAudit} = require('./audit')

const ENV_TAG = process.env.NODE_ENV === 'production' ? 'lk' : 'tk'  // live / test

// ── Key generation ─────────────────────────────────────────────────────────────

/**
 * Generate a new raw API key and its components.
 * Call once — the raw key is shown to the user ONCE and never stored.
 */
const generateKey = () => {
  const raw    = `mydd_${ENV_TAG}_${crypto.randomBytes(24).toString('hex')}`
  const prefix = raw.slice(0, 12)                              // "mydd_lk_xxxx"
  const hash   = crypto.createHash('sha256').update(raw).digest('hex')
  return { raw, prefix, hash }
}

// ── Hash lookup (hot path) ─────────────────────────────────────────────────────

const hashKey = (raw) => crypto.createHash('sha256').update(raw).digest('hex')

const lookupKey = async (raw) => {
  const hash = hashKey(raw)
  const res  = await query(
    `SELECT id, user_id, scopes, rate_limit, revoked, expires_at
       FROM api_keys
      WHERE hashed_key = $1`,
    [hash]
  )
  return res.rows[0] || null
}

// ── Usage metering (fire-and-forget) ──────────────────────────────────────────

const recordUsage = (apiKeyId) => {
  query(
    `INSERT INTO api_key_usage (api_key_id, day, requests)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (api_key_id, day) DO UPDATE SET requests = api_key_usage.requests + 1`,
    [apiKeyId]
  ).catch(() => { /* non-fatal */ })

  query(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [apiKeyId]
  ).catch(() => { /* non-fatal */ })
}

// ── Middleware factory ─────────────────────────────────────────────────────────

/**
 * apiKeyAuth(requiredScope?)
 *
 * Reads  Authorization: Bearer mydd_lk_...
 * or     X-API-Key: mydd_lk_...
 *
 * On success:  attaches req.apiKey = { id, userId, scopes }
 * On failure:  returns 401 JSON
 *
 * Can be combined with JWT auth:  app.use(authOrApiKey)
 */
const apiKeyAuth = (requiredScope = null) => async (req, res, next) => {
  // Extract raw key from header
  const bearer = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  const header = req.headers['x-api-key']
  const raw    = bearer?.startsWith('mydd_') ? bearer : header?.startsWith('mydd_') ? header : null

  if (!raw) return next()  // No API key — fall through to JWT auth

  try {
    const key = await lookupKey(raw)

    if (!key) {
      return res.status(401).json({ error: 'Invalid API key' })
    }
    if (key.revoked) {
      return res.status(401).json({ error: 'API key has been revoked' })
    }
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(401).json({ error: 'API key has expired' })
    }

    // Scope check
    const scopes = Array.isArray(key.scopes) ? key.scopes : []
    if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes('admin')) {
      return res.status(403).json({ error: `Scope '${requiredScope}' required` })
    }

    req.apiKey = { id: key.id, userId: key.user_id, scopes }
    req.userId = key.user_id  // Compatibility with JWT middleware consumers

    recordUsage(key.id)
    return next()
  } catch (err) {
    console.error(JSON.stringify({ event: 'api_key.lookup_error', err: err.message }))
    return res.status(500).json({ error: 'Authentication error' })
  }
}

// ── Management helpers (used by routes/apiKeys.js) ────────────────────────────

const createKey = async (userId, { name, scopes, rateLimit, expiresAt }) => {
  const { raw, prefix, hash } = generateKey()
  const res = await query(
    `INSERT INTO api_keys (user_id, name, prefix, hashed_key, scopes, rate_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, prefix, name, scopes, rate_limit, created_at`,
    [
      userId,
      name,
      prefix,
      hash,
      JSON.stringify(scopes || ['registry:read', 'verify:read']),
      rateLimit || 60,
      expiresAt || null,
    ]
  )
  return { ...res.rows[0], raw }  // raw returned ONCE — caller must show it to the user
}

const listKeys = async (userId) => {
  const res = await query(
    `SELECT id, name, prefix, scopes, rate_limit, last_used_at, expires_at, revoked, created_at,
            (SELECT SUM(requests) FROM api_key_usage WHERE api_key_id = api_keys.id
               AND day >= CURRENT_DATE - INTERVAL '30 days') AS requests_30d
       FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  )
  return res.rows
}

const revokeKey = async (userId, keyId) => {
  const res = await query(
    `UPDATE api_keys SET revoked = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [keyId, userId]
  )
  return res.rows[0] || null
}

module.exports = { apiKeyAuth, createKey, listKeys, revokeKey, hashKey }
