'use strict'
/**
 * routes/totp.js — 2FA TOTP endpoints (admin & PAC accounts).
 *
 * Flow:
 *  1. GET  /api/auth/2fa/setup    → generate secret + QR code data URI
 *  2. POST /api/auth/2fa/verify   → confirm first code → enable 2FA on account
 *  3. POST /api/auth/2fa/disable  → disable 2FA (requires password + live TOTP code)
 *
 * Login integration (handled in routes/auth.js):
 *  - After password check, if user.totp_enabled → return { requires2fa: true, tempToken }
 *  - POST /api/auth/2fa/validate → validate tempToken + TOTP → issue real JWT cookies
 */

const crypto  = require('crypto')
const express = require('express')
const bcrypt  = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const router  = express.Router()

const { query }                = require('../db')
const { auth }                 = require('../lib/authUtils')
const { logAudit }             = require('../lib/audit')
const { validate, schemas }    = require('../lib/validators')

// Lazy-load speakeasy (avoid crash if not installed)
const getSpeakeasy = () => {
  try { return require('speakeasy') } catch {
    throw new Error('speakeasy not found — run: npm install speakeasy')
  }
}
const getQRCode = () => {
  try { return require('qrcode') } catch {
    throw new Error('qrcode not found — run: npm install qrcode')
  }
}

const APP_NAME = 'MyDD'

const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `totp:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many 2FA attempts. Try again later.' },
})

const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `totp:validate:${req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many 2FA validation attempts. Try again later.' },
})

// ── GET /api/auth/2fa/setup ───────────────────────────────────────────────────
// Generate a TOTP secret + QR code for the current user (admin or pac only).
// The secret is stored temporarily as `totp_secret` but totp_enabled stays false
// until the user confirms with a valid code via POST /verify.
router.get('/setup', auth, totpLimiter, async (req, res) => {
  try {
    if (!['admin', 'pac'].includes(req.user.role)) {
      return res.status(403).json({ error: '2FA is only available for admin and PAC accounts' })
    }

    const speakeasy = getSpeakeasy()
    const secret = speakeasy.generateSecret({
      name:   `${APP_NAME} (${req.user.email})`,
      issuer: 'MyDD',
      length: 20,
    })

    // Persist the (unconfirmed) secret — encrypted at rest using the DB field
    await query(
      'UPDATE users SET totp_secret = $1 WHERE id = $2',
      [secret.base32, req.user.id],
    )

    // Generate QR code as data URI so the frontend renders it inline (no disk write)
    const QRCode = getQRCode()
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url)

    res.json({
      secret:  secret.base32,    // shown as backup for manual entry
      qr:      qrDataUrl,        // data:image/png;base64,... for <img src>
      message: 'Scan the QR code with your authenticator app, then confirm with POST /api/auth/2fa/verify',
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'totp_setup_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: '2FA setup failed' })
  }
})

// ── POST /api/auth/2fa/verify — confirm and ENABLE 2FA ───────────────────────
// Called once after setup: user provides the first live code from their app.
router.post('/verify', auth, totpLimiter, validate(schemas.totpVerify), async (req, res) => {
  try {
    if (!['admin', 'pac'].includes(req.user.role)) {
      return res.status(403).json({ error: '2FA is only available for admin and PAC accounts' })
    }

    const { token } = req.body

    const userRow = await query(
      'SELECT totp_secret, totp_enabled FROM users WHERE id = $1 LIMIT 1',
      [req.user.id],
    )
    const user = userRow.rows[0]
    if (!user?.totp_secret) {
      return res.status(400).json({ error: 'Run GET /api/auth/2fa/setup first' })
    }
    if (user.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled on this account' })
    }

    const speakeasy = getSpeakeasy()
    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token,
      window:   1, // ±30s tolerance
    })

    if (!valid) {
      logAudit(req.user.id, 'totp_verify_fail', 'users', req.ip, {})
      return res.status(400).json({ error: 'Invalid TOTP code — check your authenticator app clock' })
    }

    await query(
      'UPDATE users SET totp_enabled = TRUE WHERE id = $1',
      [req.user.id],
    )

    logAudit(req.user.id, 'totp_enabled', 'users', req.ip, {})
    res.json({ message: '2FA enabled successfully. Keep your secret key in a safe place as a backup.' })
  } catch (err) {
    console.error(JSON.stringify({ event: 'totp_verify_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: '2FA verification failed' })
  }
})

// ── POST /api/auth/2fa/validate — second factor during login ─────────────────
// After password check returns { requires2fa: true, tempToken }, this endpoint
// validates the TOTP code, consumes the temp token, and issues real JWT cookies.
router.post('/validate', validateLimiter, validate(schemas.totpValidate), async (req, res) => {
  try {
    const { tempToken, token } = req.body

    const tokenHash = crypto.createHash('sha256').update(tempToken).digest('hex')
    const pendingRow = await query(
      `DELETE FROM totp_pending
        WHERE token_hash = $1 AND expires_at > NOW()
       RETURNING user_id`,
      [tokenHash],
    )

    if (!pendingRow.rows.length) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' })
    }

    const userId  = pendingRow.rows[0].user_id
    const userRow = await query(
      'SELECT id, name, email, role, totp_secret, totp_enabled FROM users WHERE id = $1 LIMIT 1',
      [userId],
    )
    const user = userRow.rows[0]
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return res.status(401).json({ error: 'Authentication error' })
    }

    const speakeasy = getSpeakeasy()
    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token,
      window:   1,
    })

    if (!valid) {
      logAudit(userId, 'totp_validate_fail', 'users', req.ip, {})
      return res.status(401).json({ error: 'Invalid TOTP code' })
    }

    // Issue real JWT cookies (re-use helpers from authUtils)
    const { issueAccessToken, issueRefreshToken, hashToken } = require('../lib/authUtils')
    const { token: accessToken, jti: accessJti } = issueAccessToken(user)
    const { token: refreshToken, jti: refreshJti } = issueRefreshToken(user)

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(refreshToken), expiresAt],
    )
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])

    const IS_PROD = process.env.NODE_ENV === 'production'
    res.cookie('token', accessToken, {
      httpOnly: true, secure: IS_PROD, sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    })
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true, secure: IS_PROD, sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    })

    logAudit(user.id, 'login_2fa_success', 'users', req.ip, {})
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'totp_validate_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: '2FA validation failed' })
  }
})

// ── POST /api/auth/2fa/disable ────────────────────────────────────────────────
// Disable 2FA — requires both current password AND a live TOTP code.
router.post('/disable', auth, totpLimiter, validate(schemas.totpDisable), async (req, res) => {
  try {
    const { password, token } = req.body

    const userRow = await query(
      'SELECT id, password, totp_secret, totp_enabled FROM users WHERE id = $1 LIMIT 1',
      [req.user.id],
    )
    const user = userRow.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled on this account' })

    // Verify password
    const passwordOk = await bcrypt.compare(password, user.password)
    if (!passwordOk) {
      logAudit(req.user.id, 'totp_disable_bad_password', 'users', req.ip, {})
      return res.status(401).json({ error: 'Incorrect password' })
    }

    // Verify TOTP
    const speakeasy = getSpeakeasy()
    const codeOk = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token,
      window:   1,
    })
    if (!codeOk) {
      logAudit(req.user.id, 'totp_disable_bad_code', 'users', req.ip, {})
      return res.status(401).json({ error: 'Invalid TOTP code' })
    }

    await query(
      'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1',
      [req.user.id],
    )
    logAudit(req.user.id, 'totp_disabled', 'users', req.ip, {})
    res.json({ message: '2FA disabled successfully' })
  } catch (err) {
    console.error(JSON.stringify({ event: 'totp_disable_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to disable 2FA' })
  }
})

module.exports = router
