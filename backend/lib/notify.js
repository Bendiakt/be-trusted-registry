'use strict'

/**
 * Persist a notification row and, if the user has an active WebSocket
 * connection, push a real-time `notification` event so the bell updates
 * without a poll.
 */

const { query }    = require('../db')
const { notifyUser } = require('./wsNotify')

/**
 * createNotification(userId, { type, title, body?, link? })
 * Inserts a row into `notifications` and pushes a WS event to the user.
 * Fire-and-forget — callers should not await this in the request path.
 */
async function createNotification(userId, { type = 'info', title, body = null, link = null }) {
  try {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, title, body, link, read, created_at`,
      [userId, type, title, body, link],
    )
    const row = result.rows[0]
    if (row) {
      // Push real-time update so the bell badge refreshes immediately
      notifyUser(userId, {
        type: 'notification',
        notification: {
          id:        row.id,
          type:      row.type,
          title:     row.title,
          body:      row.body  || null,
          link:      row.link  || null,
          read:      row.read,
          createdAt: row.created_at,
        },
      })
    }
  } catch (err) {
    // Non-fatal — log and continue
    console.error('createNotification error:', err.message)
  }
}

module.exports = { createNotification }
