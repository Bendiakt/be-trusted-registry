'use strict'

const jwt    = require('jsonwebtoken')
const crypto = require('crypto')
const { query } = require('../db')

const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('Missing JWT_SECRET environment variable')

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || SECRET
if (!process.env.JWT_REFRESH_SECRET) {
  console.warn('JWT_REFRESH_SECRET is missing; falling back to JWT_SECRET')
}

const hashToken = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex')

const issueAccessToken = (user) => {
  const jti   = crypto.randomUUID()
  const token = jwt.sign(
    { jti, id: user.id, role: user.role, name: user.name, email: user.email },
    SECRET,
    { expiresIn: '15m' },
  )
  return { token, jti }
}

const issueRefreshToken = (user) => {
  const jti   = crypto.randomUUID()
  const token = jwt.sign(
    { jti, id: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: '30d' },
  )
  return { token, jti }
}

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, SECRET)
    if (decoded?.jti) {
      const blacklisted = await query(
        'SELECT 1 FROM token_blacklist WHERE jti = $1 AND expires_at > NOW() LIMIT 1',
        [decoded.jti],
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

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  return next()
}

module.exports = {
  SECRET,
  REFRESH_SECRET,
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  auth,
  requireAdmin,
}
