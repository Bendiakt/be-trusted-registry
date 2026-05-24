'use strict'
/**
 * lib/wsServer.js — WebSocket server for real-time metric broadcasts.
 *
 * Handles the /ws/metrics upgrade path.
 * Authenticates via httpOnly JWT cookie (no token in URL).
 * Broadcasts business metrics every 10 s to all connected clients.
 *
 * Usage (server.js):
 *   const { setupWsServer, notifyUser } = require('./lib/wsServer')
 *   setupWsServer(httpServer)
 *   notifyUser(userId, { type: 'notification', ... })
 */

const { WebSocketServer } = require('ws')
const jwt                 = require('jsonwebtoken')
const { query }           = require('../db')
const { SECRET }          = require('./auth')
const { getRuntimeMetrics } = require('./runtimeMetrics')
// Canonical user-notification registry shared with admin routes
const { userWsClients, notifyUser } = require('./wsNotify')

// ── Business metrics query ────────────────────────────────────────────────────
const getBusinessMetrics = async () => {
  try {
    const { requestCount } = getRuntimeMetrics()
    const combined = await query(
      `SELECT
         (SELECT COUNT(*) FROM users)                                          AS users_total,
         (SELECT COUNT(*) FROM companies)                                      AS companies_total,
         (SELECT COUNT(*) FROM companies WHERE certification_level > 0)        AS certified_total,
         (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = FALSE)            AS fraud_alerts_active,
         (SELECT ROUND(AVG(score), 1)
            FROM trust_scores
           WHERE computed_at > NOW() - INTERVAL '7 days')                     AS avg_trust_score,
         (SELECT COALESCE(SUM(
           CASE certification_level
             WHEN 1 THEN 490
             WHEN 2 THEN 990
             WHEN 3 THEN 2490
             ELSE 0
           END
         ), 0)
            FROM companies
           WHERE certification_level > 0)                                     AS revenue_total_usd`
    )
    const row          = combined.rows[0] || {}
    const usersTotal   = parseInt(row.users_total      || '0', 10)
    const compTotal    = parseInt(row.companies_total  || '0', 10)
    const certTotal    = parseInt(row.certified_total  || '0', 10)
    return {
      timestamp:           new Date().toISOString(),
      users_total:         usersTotal,
      companies_total:     compTotal,
      certified_total:     certTotal,
      cert_rate_pct:       compTotal > 0 ? Math.round((certTotal / compTotal) * 100) : 0,
      fraud_alerts_active: parseInt(row.fraud_alerts_active || '0', 10),
      avg_trust_score:     parseFloat(row.avg_trust_score || 0),
      revenue_total_usd:   parseFloat(row.revenue_total_usd || 0),
      requests_total:      requestCount,
    }
  } catch (e) {
    console.error(JSON.stringify({ event: 'ws.business_metrics.error', err: e.message }))
    return null
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────
const setupWsServer = (httpServer) => {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/metrics' })

  wss.on('connection', (ws, req) => {
    let wsUserId = null
    try {
      const rawCookies = req.headers.cookie || ''
      const cookieMap  = Object.fromEntries(
        rawCookies.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
      )
      const token = cookieMap['token']
      if (token) {
        const decoded = jwt.verify(token, SECRET)
        wsUserId = decoded?.id ? Number(decoded.id) : null
      }
    } catch { /* anonymous WS — only gets aggregate metrics */ }

    if (wsUserId !== null) {
      if (!userWsClients.has(wsUserId)) userWsClients.set(wsUserId, new Set())
      userWsClients.get(wsUserId).add(ws)
    }

    // Send initial snapshot immediately
    getBusinessMetrics().then(data => {
      if (data && ws.readyState === 1) ws.send(JSON.stringify({ type: 'metrics', data }))
    }).catch(() => {})

    ws.on('close', () => {
      if (wsUserId !== null) {
        const clients = userWsClients.get(wsUserId)
        if (clients) {
          clients.delete(ws)
          if (clients.size === 0) userWsClients.delete(wsUserId)
        }
      }
    })
  })

  // Broadcast business metrics every 10 s
  const broadcast = setInterval(async () => {
    if (wss.clients.size === 0) return
    try {
      const data = await getBusinessMetrics()
      if (!data) return
      const msg = JSON.stringify({ type: 'metrics', data })
      for (const ws of wss.clients) {
        if (ws.readyState === 1) ws.send(msg)
      }
    } catch (e) {
      console.error(JSON.stringify({ event: 'ws.broadcast.error', err: e.message }))
    }
  }, 10 * 1000)

  if (typeof broadcast.unref === 'function') broadcast.unref()

  return wss
}

module.exports = { setupWsServer, notifyUser }
