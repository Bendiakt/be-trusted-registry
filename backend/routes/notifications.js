'use strict'

const express    = require('express')
const rateLimit  = require('express-rate-limit')
const router     = express.Router()

const { query }    = require('../db')
const { auth }     = require('../lib/authUtils')
const { logAudit } = require('../lib/audit')

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Reads: 120/min per user — covers the 30 s polling + bell open interactions
const readLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `notif:read:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many requests. Slow down.' },
})

// Writes: 60/min per user — mark-read actions
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `notif:write:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many requests. Slow down.' },
})

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns the 50 most-recent notifications for the authenticated user.
// Response: { notifications: [...], unread: <count> }
router.get('/', auth, readLimiter, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, type, title, body, link, read, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.id],
    )
    const notifications = result.rows.map(r => ({
      id:        r.id,
      type:      r.type,
      title:     r.title,
      body:      r.body  || null,
      link:      r.link  || null,
      read:      r.read,
      createdAt: r.created_at,
    }))
    const unread = notifications.filter(n => !n.read).length
    res.json({ notifications, unread })
  } catch (err) {
    console.error('Notifications fetch error:', err.message)
    res.status(500).json({ error: 'Failed to load notifications' })
  }
})

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
// Mark ALL unread notifications for the user as read.
router.patch('/read-all', auth, writeLimiter, async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
      [req.user.id],
    )
    res.json({ message: 'All notifications marked as read.' })
  } catch (err) {
    console.error('Notifications read-all error:', err.message)
    res.status(500).json({ error: 'Failed to mark notifications as read' })
  }
})

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
// Mark a single notification as read (must belong to the authenticated user).
router.patch('/:id/read', auth, writeLimiter, async (req, res) => {
  try {
    const notifId = parseInt(req.params.id, 10)
    if (Number.isNaN(notifId)) return res.status(400).json({ error: 'Invalid notification id' })

    const result = await query(
      `UPDATE notifications SET read = TRUE
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [notifId, req.user.id],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Notification not found' })
    res.json({ message: 'Notification marked as read.' })
  } catch (err) {
    console.error('Notification read error:', err.message)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
// Delete a single notification (must belong to the authenticated user).
router.delete('/:id', auth, writeLimiter, async (req, res) => {
  try {
    const notifId = parseInt(req.params.id, 10)
    if (Number.isNaN(notifId)) return res.status(400).json({ error: 'Invalid notification id' })

    const result = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [notifId, req.user.id],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Notification not found' })
    res.json({ deleted: notifId })
  } catch (err) {
    console.error('Notification delete error:', err.message)
    res.status(500).json({ error: 'Failed to delete notification' })
  }
})

// ── DELETE /api/notifications ─────────────────────────────────────────────────
// Delete all READ notifications for the authenticated user (bulk clear).
// Unread notifications are intentionally kept — they have not been acknowledged.
router.delete('/', auth, writeLimiter, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM notifications WHERE user_id = $1 AND read = TRUE RETURNING id`,
      [req.user.id],
    )
    res.json({ deleted: result.rowCount })
  } catch (err) {
    console.error('Notifications clear-read error:', err.message)
    res.status(500).json({ error: 'Failed to clear notifications' })
  }
})

module.exports = router
