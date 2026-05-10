'use strict'

// In-process WebSocket user notification state.
// Populated by server.js when a user connects via /ws/metrics?token=
// Consumed by admin routes to push real-time events to specific users.

const userWsClients = new Map()

const notifyUser = (userId, payload) => {
  const clients = userWsClients.get(Number(userId))
  if (!clients) return
  const msg = JSON.stringify(payload)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

module.exports = { userWsClients, notifyUser }
