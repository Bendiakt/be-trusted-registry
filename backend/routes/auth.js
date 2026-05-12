'use strict'

const express   = require('express')
const bcrypt    = require('bcryptjs')
const crypto    = require('crypto')
const rateLimit = require('express-rate-limit')
const router    = express.Router()

const { query }                                  = require('../db')
const { auth, hashToken, issueAccessToken,
        issueRefreshToken, SECRET, REFRESH_SECRET } = require('../lib/authUtils')
const { logAudit }                               = require('../lib/audit')
const { checkFraud }                             = require('../lib/fraudDetection')
const { sendWelcome, sendPasswordReset,
        sendEmailVerification }                  = require('../lib/mailer')

// ── Rate limiters ─────────────────────────────────────────────────────────────
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' },
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req, _res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const ip    = (req.ip || 'unknown').replace(/^::ffff:/, '')
    return `${ip}:${email}`
  },
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many login attempts. Try again later.' },
})

const resendVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 3,
  standardHeaders: true, legacyHeaders: false,
})

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again later.' },
})

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many reset attempts. Try again later.' },
})

const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many profile update attempts. Try again later.' },
})

// ── Cookie helpers ────────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production'

/** Set the two auth cookies (access + refresh) on a response. */
const setAuthCookies = (res, token, refreshToken) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 min — matches JWT expiry
  })
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — matches JWT expiry
    path: '/api/auth/refresh',         // scoped: only sent to the refresh endpoint
  })
}

/** Clear both auth cookies (call on logout). */
const clearAuthCookies = (res) => {
  res.clearCookie('token',         { httpOnly: true, secure: IS_PROD, sameSite: 'strict' })
  res.clearCookie('refresh_token', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', path: '/api/auth/refresh' })
}

// ── POST /register ────────────────────────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' })

    const nameStr     = String(name).trim()
    const emailStr    = String(email).trim().toLowerCase()
    const passwordStr = String(password)

    if (nameStr.length < 2 || nameStr.length > 120) return res.status(400).json({ error: 'Name must be 2–120 characters' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr))  return res.status(400).json({ error: 'Invalid email address' })
    if (passwordStr.length < 8)   return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (passwordStr.length > 128) return res.status(400).json({ error: 'Password too long' })
    // Strength: at least one uppercase, one lowercase, one digit
    if (!/[A-Z]/.test(passwordStr)) return res.status(400).json({ error: 'Password must contain at least one uppercase letter' })
    if (!/[a-z]/.test(passwordStr)) return res.status(400).json({ error: 'Password must contain at least one lowercase letter' })
    if (!/[0-9]/.test(passwordStr)) return res.status(400).json({ error: 'Password must contain at least one digit' })

    const VALID_ROLES   = ['company', 'trader', 'pac']
    const resolvedRole  = VALID_ROLES.includes(role) ? role : 'company'

    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [emailStr])
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' })

    const hash          = await bcrypt.hash(passwordStr, 10)
    const verifyToken   = crypto.randomBytes(32).toString('hex')
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await query(
      `INSERT INTO users (name, email, password, role, email_verify_token, email_verify_expires)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nameStr, emailStr, hash, resolvedRole, verifyToken, verifyExpires],
    )

    res.json({ message: 'Registered successfully. Please check your email to verify your account.' })
    logAudit(null, 'user_register', 'users', req.ip, { email: emailStr, role: resolvedRole })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    sendEmailVerification({ email: emailStr, name: nameStr, verifyUrl: `${frontendUrl}/verify-email?token=${verifyToken}` }).catch(() => {})
    sendWelcome({ email: emailStr, name: nameStr }).catch(() => {})
    checkFraud({ userId: null, email: emailStr, ip: req.ip, action: 'user_register' }).catch(() => {})
  } catch (err) {
    console.error('Register error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// ── GET /verify-email ─────────────────────────────────────────────────────────
router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '').trim()
  if (!token) return res.status(400).json({ error: 'Missing token' })
  try {
    const result = await query(
      `UPDATE users
          SET email_verified = TRUE, email_verify_token = NULL, email_verify_expires = NULL
        WHERE email_verify_token = $1
          AND email_verify_expires > NOW()
          AND email_verified = FALSE
       RETURNING id, email`,
      [token],
    )
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired token' })
    logAudit(result.rows[0].id, 'email_verified', 'users', req.ip, { email: result.rows[0].email })
    res.json({ message: 'Email verified successfully' })
  } catch (err) {
    console.error('Email verify error:', err.message)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// ── POST /resend-verification (authenticated — from dashboard) ────────────────
router.post('/resend-verification', resendVerifyLimiter, auth, async (req, res) => {
  try {
    const userResult = await query('SELECT id, name, email, email_verified FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    const user = userResult.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified' })

    const newToken   = crypto.randomBytes(32).toString('hex')
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await query(
      'UPDATE users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3',
      [newToken, newExpires, req.user.id],
    )
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    sendEmailVerification({ email: user.email, name: user.name, verifyUrl: `${frontendUrl}/verify-email?token=${newToken}` }).catch(() => {})
    res.json({ message: 'Verification email sent' })
  } catch (err) {
    console.error('Resend verify error:', err.message)
    res.status(500).json({ error: 'Failed to resend' })
  }
})

// ── POST /resend-verification-public (unauthenticated — from login page) ──────
// Rate-limited by email. Always returns 200 to avoid leaking account existence.
router.post('/resend-verification-public', resendVerifyLimiter, async (req, res) => {
  // Always return success immediately to prevent timing-based email enumeration
  res.json({ message: 'If that email exists and is unverified, a new link has been sent.' })
  try {
    const emailStr = String(req.body?.email || '').trim().toLowerCase()
    if (!emailStr) return
    const userResult = await query(
      'SELECT id, name, email, email_verified FROM users WHERE email = $1 LIMIT 1',
      [emailStr],
    )
    const user = userResult.rows[0]
    if (!user || user.email_verified) return

    const newToken   = crypto.randomBytes(32).toString('hex')
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await query(
      'UPDATE users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3',
      [newToken, newExpires, user.id],
    )
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    sendEmailVerification({ email: user.email, name: user.name, verifyUrl: `${frontendUrl}/verify-email?token=${newToken}` }).catch(() => {})
    logAudit(user.id, 'resend_verify_public', 'users', req.ip, { email: emailStr })
  } catch (err) {
    console.error('Resend-verify-public error:', err.message)
    // Response already sent — swallow error silently
  }
})

// ── POST /login ───────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken')

// Account lock constants: 5 failed attempts → 15-minute lockout
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES     = 15

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Invalid credentials' })

    const emailStr   = String(email).trim().toLowerCase()
    const userResult = await query(
      `SELECT id, name, email, password, role, email_verified,
              failed_login_attempts, locked_until
       FROM users WHERE email = $1 LIMIT 1`,
      [emailStr],
    )
    const user = userResult.rows[0]
    // Use constant-time response to avoid email enumeration
    if (!user) {
      await bcrypt.compare(password, '$2a$10$invalidhashpadding00000000000000000000000000000000')
      return res.status(400).json({ error: 'Invalid credentials' })
    }

    // ── Account lockout check ─────────────────────────────────────────────────
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000)
      logAudit(user.id, 'login_blocked_lockout', 'users', req.ip, { email: emailStr })
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      // Increment failed attempts; lock if threshold reached
      const newAttempts = (user.failed_login_attempts || 0) + 1
      const shouldLock  = newAttempts >= MAX_FAILED_ATTEMPTS
      await query(
        `UPDATE users
            SET failed_login_attempts = $1,
                locked_until          = ${shouldLock ? `NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes'` : 'locked_until'}
          WHERE id = $2`,
        [newAttempts, user.id],
      )
      logAudit(user.id, 'login_failed', 'users', req.ip, { email: emailStr, attempt: newAttempts, locked: shouldLock })
      if (shouldLock) {
        return res.status(429).json({ error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` })
      }
      return res.status(400).json({ error: 'Invalid credentials' })
    }

    // ── Email verification gate ───────────────────────────────────────────────
    // Bypassed in test environments via SMOKE_TEST_SKIP_EMAIL_VERIFY=true
    const skipEmailVerify = process.env.SMOKE_TEST_SKIP_EMAIL_VERIFY === 'true'
    if (!user.email_verified && !skipEmailVerify) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        code:  'EMAIL_NOT_VERIFIED',
      })
    }

    // ── Success: reset lockout counters ───────────────────────────────────────
    const { token, jti }          = issueAccessToken(user)
    const { token: refreshToken } = issueRefreshToken(user)
    const refreshDecoded          = jwt.decode(refreshToken)

    await Promise.all([
      query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, to_timestamp($3))`,
        [user.id, hashToken(refreshToken), refreshDecoded.exp],
      ),
      query(
        `UPDATE users
            SET last_login             = NOW(),
                failed_login_attempts  = 0,
                locked_until           = NULL
          WHERE id = $1`,
        [user.id],
      ),
    ])

    // Set httpOnly cookies (web frontend) — tokens also returned in body for API clients
    setAuthCookies(res, token, refreshToken)
    res.json({ token, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    logAudit(user.id, 'user_login', 'users', req.ip, { email: emailStr, jti })
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ── POST /refresh ─────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    // Accept from httpOnly cookie (web) or request body (API clients / mobile)
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' })

    const payload = jwt.verify(refreshToken, REFRESH_SECRET)
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token' })

    const stored = await query(
      `SELECT id, user_id FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [hashToken(refreshToken)],
    )
    if (stored.rows.length === 0) return res.status(401).json({ error: 'Refresh token revoked or expired' })

    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.rows[0].id])

    const userResult = await query('SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1', [stored.rows[0].user_id])
    const user = userResult.rows[0]
    if (!user) return res.status(401).json({ error: 'User not found' })

    const { token }              = issueAccessToken(user)
    const { token: newRefresh }  = issueRefreshToken(user)
    const newRefreshDecoded      = jwt.decode(newRefresh)
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3))`,
      [user.id, hashToken(newRefresh), newRefreshDecoded.exp],
    )
    // Set new cookies (web) — also return in body (API clients)
    setAuthCookies(res, token, newRefresh)
    return res.json({ token, refreshToken: newRefresh })
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' })
  }
})

// ── POST /logout ──────────────────────────────────────────────────────────────
router.post('/logout', auth, async (req, res) => {
  try {
    const accessToken  = req.headers.authorization?.split(' ')[1] || req.cookies?.token
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken || null
    const decoded      = jwt.verify(accessToken, SECRET)

    if (decoded?.jti && decoded?.exp) {
      await query(
        `INSERT INTO token_blacklist (jti, user_id, expires_at)
         VALUES ($1, $2, to_timestamp($3))
         ON CONFLICT (jti) DO NOTHING`,
        [decoded.jti, decoded.id || null, decoded.exp],
      )
    }
    if (refreshToken) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND user_id = $2`,
        [hashToken(refreshToken), decoded.id],
      )
    }
    await query('DELETE FROM token_blacklist WHERE expires_at <= NOW()')
    await query('DELETE FROM refresh_tokens  WHERE expires_at <= NOW()')
    // Clear httpOnly cookies (web sessions)
    clearAuthCookies(res)
    return res.json({ message: 'Logged out' })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
})

// ── POST /forgot-password ─────────────────────────────────────────────────────
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  res.json({ message: 'If this email is registered you will receive a reset link.' })
  try {
    const emailStr = String(req.body?.email || '').trim().toLowerCase()
    if (!emailStr) return

    const userResult = await query('SELECT id, name, email FROM users WHERE email = $1 LIMIT 1', [emailStr])
    if (!userResult.rows.length) return

    const user       = userResult.rows[0]
    const rawToken   = crypto.randomBytes(32).toString('hex')
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt  = new Date(Date.now() + 60 * 60 * 1000)

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO NOTHING`,
      [user.id, tokenHash, expiresAt],
    )
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    sendPasswordReset({ email: user.email, name: user.name, resetUrl: `${frontendUrl}/reset-password/${rawToken}` }).catch(() => {})
  } catch (err) {
    console.error('Forgot password error:', err.message)
  }
})

// ── POST /reset-password ──────────────────────────────────────────────────────
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' })
    if (String(password).length < 8)   return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (String(password).length > 128) return res.status(400).json({ error: 'Password too long' })

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')
    const claimResult = await query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
       RETURNING id, user_id`,
      [tokenHash],
    )
    if (!claimResult.rows.length) return res.status(400).json({ error: 'Reset link is invalid or expired' })

    const { user_id } = claimResult.rows[0]
    const hash        = await bcrypt.hash(String(password), 10)

    await Promise.all([
      query('UPDATE users SET password = $1 WHERE id = $2', [hash, user_id]),
      query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user_id]),
    ])

    logAudit(user_id, 'password_reset', 'users', req.ip, {})
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    console.error('Reset password error:', err.message)
    res.status(500).json({ error: 'Reset failed' })
  }
})

// ── PATCH /api/auth/profile — update display name and/or password ─────────────
router.patch('/profile', profileLimiter, auth, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body

  const updates = []
  const params  = []
  let   pi      = 1

  try {
    const userResult = await query('SELECT id, name, password FROM users WHERE id = $1', [req.user.id])
    const user = userResult.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Name update
    if (name !== undefined) {
      const trimmed = String(name || '').trim()
      if (trimmed.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' })
      if (trimmed.length > 100) return res.status(400).json({ error: 'Name too long (max 100 chars).' })
      updates.push(`name = $${pi++}`)
      params.push(trimmed)
    }

    // Password change
    if (newPassword !== undefined && newPassword !== '') {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required to set a new one.' })
      const valid = await bcrypt.compare(String(currentPassword), user.password || '')
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' })
      if (String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' })
      if (String(newPassword).length > 128) return res.status(400).json({ error: 'Password too long.' })
      const hashed = await bcrypt.hash(String(newPassword), 12)
      updates.push(`password = $${pi++}`)
      params.push(hashed)
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' })

    params.push(req.user.id)
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pi}`, params)

    logAudit(req.user.id, 'profile_update', 'users', req.ip, {
      nameChanged:     name !== undefined,
      passwordChanged: newPassword !== undefined && newPassword !== '',
    })

    // Return the current name so the frontend can update localStorage without a
    // separate GET call.
    const updated = await query('SELECT name, email FROM users WHERE id = $1', [req.user.id])
    const updatedUser = updated.rows[0] || {}
    res.json({ message: 'Profile updated successfully.', name: updatedUser.name, email: updatedUser.email })
  } catch (err) {
    console.error('Profile update error:', err.message)
    res.status(500).json({ error: 'Update failed.' })
  }
})

// ── GET /csrf-token — initialise the CSRF double-submit cookie ────────────────
// Called once by the frontend on app load. Sets the non-httpOnly csrf_token
// cookie (readable by JS) so the frontend can inject it as X-CSRF-Token header.
router.get('/csrf-token', (req, res) => {
  const token = require('crypto').randomBytes(32).toString('hex')
  res.cookie('csrf_token', token, {
    httpOnly: false, // must be readable by JS
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 h
  })
  res.json({ ok: true })
})

module.exports = router
