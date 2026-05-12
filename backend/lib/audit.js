'use strict'

const { query }            = require('../db')
const { hashForIntegrity } = require('./encryption')

const logAudit = (userId, action, resource, ip, payload) => {
  const hash = hashForIntegrity(payload || '')
  query(
    'INSERT INTO audit_log (user_id, action, resource, ip_address, payload_hash) VALUES ($1, $2, $3, $4, $5)',
    [userId || null, action, resource || null, ip || null, hash],
  ).catch((e) => console.error(JSON.stringify({ event: 'audit_log_error', message: e.message })))
}

module.exports = { logAudit }
