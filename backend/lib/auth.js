'use strict'
/**
 * lib/auth.js — Shared authentication helpers.
 *
 * Centralises all JWT logic (issuing, verifying, blacklist check) and
 * Express middleware (auth, requireAdmin) so every router imports from
 * one place rather than duplicating or cross-requiring server.js.
 */

const crypto  = require('crypto')
const jwt     = require('jsonwebtoken')
const rateLimit              = require('express-rate-limit')
const { ipKeyGenerator }     = require('express-rate-limit')
const { makeRateLimiter }    = require('./rateLimiter')
const { query }              = require('../db')

// ── Secrets ───────────────────────────────────────────────────────────────────
const SECRET         = process.env.JWT_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || SECRET

if (!SECRET) throw new Error('lib/auth.js: JWT_SECRET is not set')
if (!process.env.JWT_REFRESH_SECRET) {
  console.warn(JSON.stringify({ event: 'env_warning', key: 'JWT_REFRESH_SECRET', note: 'falling back to JWT_SECRET' }))
}

// ── Token helpers ─────────────────────────────────────────────────────────────

/** SHA-256 hash of a token value — used for DB storage (never store raw tokens). */
const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

/**
 * Issue a short-lived access token (15 min).
 * Includes a unique jti so it can be individually revoked via the blacklist.
 */
const issueAccessToken = (user) => {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { jti, id: user.id, role: user.role, name: user.name, email: user.email },
    SECRET,
    { expiresIn: '15m' }
  )
  return { token, jti }
}

/**
 * Issue a long-lived refresh token (30 days).
 * Stored (as a hash) in refresh_tokens; revoked on use (one-time rotation).
 */
const issueRefreshToken = (user) => {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { jti, id: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: '30d' }
  )
  return { token, jti }
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

// ── Rate limiters — Redis-backed when REDIS_URL is set, memory otherwise ──────

const registerLimiter = makeRateLimiter({
  _prefix:    'rl:register:',
  windowMs:   60 * 60 * 1000,
  max:        5,
  message:    { error: 'Too many registration attempts. Try again later.' },
})

/** General public read limiter — guards scraping / enumeration. */
const publicReadLimiter = makeRateLimiter({
  _prefix:  'rl:pub:',
  windowMs: 60 * 1000,
  max:      30,
  message:  { error: 'Too many requests. Slow down.' },
})

/**
 * B2B API key read limiter — higher throughput for authenticated integrations.
 * Applied when a valid X-API-Key header is present on public routes.
 * Rate limit per key ID, not per IP.
 */
const apiKeyReadLimiter = makeRateLimiter({
  _prefix:  'rl:apikey:',
  windowMs: 60 * 1000,
  max:      300,
  keyGenerator: (req) => `key:${req.apiKey?.id || 'unknown'}`,
  validate: { keyGeneratorIpFallback: false },
  message:  { error: 'API key rate limit exceeded. Reduce request frequency.' },
})

/** Per-IP + per-email login limiter. */
const loginLimiter = makeRateLimiter({
  _prefix:  'rl:login:',
  windowMs: 15 * 60 * 1000,
  max:      10,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    return `${ipKeyGenerator(req)}:${email}`
  },
  message: { error: 'Too many login attempts. Try again later.' },
})

/** Limits token verification to prevent automated scanning. */
const verifyEmailLimiter = makeRateLimiter({
  _prefix:  'rl:verify:',
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: 'Too many verification attempts. Try again later.' },
})

const resendVerifyLimiter = makeRateLimiter({
  _prefix:  'rl:resend:',
  windowMs: 15 * 60 * 1000,
  max:      3,
})

const forgotLimiter = makeRateLimiter({
  _prefix:  'rl:forgot:',
  windowMs: 15 * 60 * 1000,
  max:      5,
  message:  { error: 'Too many password reset requests. Try again later.' },
})

const resetPasswordLimiter = makeRateLimiter({
  _prefix:  'rl:reset:',
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: 'Too many reset attempts. Try again later.' },
})

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * auth — verifies the Bearer JWT (or httpOnly cookie) and checks the blacklist.
 * Reads from:
 *   1. Authorization: Bearer <token> header  (API clients, mobile, existing integrations)
 *   2. req.cookies.token                     (web frontend with httpOnly cookie strategy)
 * Attaches decoded payload to req.user on success.
 */
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, SECRET)
    if (decoded?.jti) {
      const blacklisted = await query(
        'SELECT 1 FROM token_blacklist WHERE jti = $1 AND expires_at > NOW() LIMIT 1',
        [decoded.jti]
      )
      if (blacklisted.rows.length > 0) {
        return res.status(401).json({ error: 'Token revoked' })
      }
    }
    req.user = decoded
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

/** requireAdmin — must come after auth; rejects non-admin roles. */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  return next()
}

/**
 * requireRole(...roles) — factory that returns middleware enforcing one or more
 * allowed roles. Must come after auth. Example:
 *   router.get('/stats', auth, requireRole('trader', 'admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  return next()
}

// ── Password strength ─────────────────────────────────────────────────────────

/**
 * validatePassword — returns an error string if the password fails any rule,
 * or null if it passes. Import in any route that sets a password.
 */
const validatePassword = (pw) => {
  const s = String(pw)
  if (s.length < 8)   return 'Password must be at least 8 characters'
  if (s.length > 128) return 'Password too long'
  if (!/[a-z]/.test(s)) return 'Password must contain at least one lowercase letter'
  if (!/[A-Z]/.test(s)) return 'Password must contain at least one uppercase letter'
  if (!/[0-9]/.test(s)) return 'Password must contain at least one digit'
  return null
}

module.exports = {
  SECRET,
  REFRESH_SECRET,
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  // limiters
  registerLimiter,
  publicReadLimiter,
  apiKeyReadLimiter,
  loginLimiter,
  verifyEmailLimiter,
  resendVerifyLimiter,
  forgotLimiter,
  resetPasswordLimiter,
  // middleware
  auth,
  requireAdmin,
  requireRole,
  // validators
  validatePassword,
}
