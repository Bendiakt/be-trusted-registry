'use strict'
/**
 * lib/cronJobs.js — Scheduled background tasks.
 *
 * Call startCronJobs() once after the server is listening and the DB
 * is initialized. Each job is delayed from boot to avoid hammering the DB
 * during the startup window.
 *
 * Jobs:
 *  - Token cleanup       — every 1 h   (removes expired JWT blacklist/refresh tokens)
 *  - Renewal reminder    — every 24 h  (D-30 email for certs expiring in 25-35 days)
 *  - Urgent reminder     — every 24 h  (D-7 email for certs expiring in 5-7 days)
 *  - Cert expiry         — every 24 h  (marks active→expired, revokes cert level)
 *  - PII retention       — every 24 h  (purge api_key_usage >90d, audit_log >2yr)
 */

const { query }                              = require('../db')
const { sendRenewalReminder, sendCertExpired } = require('./mailer')

// ── Token cleanup ─────────────────────────────────────────────────────────────
const runTokenCleanup = async () => {
  try {
    const r1 = await query('DELETE FROM token_blacklist  WHERE expires_at <= NOW()')
    const r2 = await query('DELETE FROM refresh_tokens   WHERE expires_at <= NOW()')
    if ((r1.rowCount + r2.rowCount) > 0) {
      console.log(JSON.stringify({ event: 'token_cleanup', blacklist: r1.rowCount, refresh: r2.rowCount }))
    }
  } catch (e) {
    console.error(JSON.stringify({ event: 'token_cleanup.error', err: e.message }))
  }
}

// ── Renewal reminder — D-30 ───────────────────────────────────────────────────
const runRenewalReminders = async () => {
  try {
    const result = await query(
      `SELECT c.id AS cert_id, c.level, c.expires_at,
              co.company_name, co.user_id,
              u.email, u.name
         FROM certifications c
         JOIN companies co ON co.id = c.company_id
         JOIN users     u  ON u.id  = co.user_id
        WHERE c.status = 'active'
          AND c.expires_at BETWEEN NOW() + INTERVAL '25 days' AND NOW() + INTERVAL '35 days'
          AND c.renewal_reminder_sent_at IS NULL
          AND u.email IS NOT NULL`
    )
    if (!result.rows.length) return
    const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
    for (const row of result.rows) {
      await sendRenewalReminder({
        email: row.email, name: row.name, companyName: row.company_name,
        level: row.level, expiresAt: row.expires_at,
        renewUrl: `${frontendUrl}/dashboard`,
      })
      await query('UPDATE certifications SET renewal_reminder_sent_at = NOW() WHERE id = $1', [row.cert_id])
    }
    console.log(JSON.stringify({ event: 'renewal_reminders_sent', count: result.rows.length }))
  } catch (e) {
    console.error(JSON.stringify({ event: 'renewal_reminders.error', err: e.message }))
  }
}

// ── Urgent reminder — D-7 ─────────────────────────────────────────────────────
const runUrgentReminders = async () => {
  try {
    const result = await query(
      `SELECT c.id AS cert_id, c.level, c.expires_at,
              co.company_name, u.email, u.name
         FROM certifications c
         JOIN companies co ON co.id = c.company_id
         JOIN users     u  ON u.id  = co.user_id
        WHERE c.status = 'active'
          AND c.expires_at BETWEEN NOW() + INTERVAL '5 days' AND NOW() + INTERVAL '7 days'
          AND (c.renewal_reminder_sent_at IS NULL
               OR c.renewal_reminder_sent_at < NOW() - INTERVAL '4 days')
          AND u.email IS NOT NULL`
    )
    if (!result.rows.length) return
    const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
    for (const row of result.rows) {
      await sendRenewalReminder({
        email: row.email, name: row.name, companyName: row.company_name,
        level: row.level, expiresAt: row.expires_at,
        renewUrl: `${frontendUrl}/dashboard`,
      })
      await query('UPDATE certifications SET renewal_reminder_sent_at = NOW() WHERE id = $1', [row.cert_id])
    }
    console.log(JSON.stringify({ event: 'urgent_reminders_sent', count: result.rows.length }))
  } catch (e) {
    console.error(JSON.stringify({ event: 'urgent_reminders.error', err: e.message }))
  }
}

// ── Cert expiry enforcement ───────────────────────────────────────────────────
const runCertExpiryCleanup = async () => {
  try {
    const expired = await query(
      `UPDATE certifications
          SET status = 'expired', updated_at = NOW()
        WHERE status = 'active'
          AND expires_at < NOW()
        RETURNING id, company_id, level`
    )
    if (!expired.rows.length) return
    const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'

    for (const cert of expired.rows) {
      await query(
        `UPDATE companies
            SET certification_level = 0, updated_at = NOW()
          WHERE id = $1
            AND NOT EXISTS (
              SELECT 1 FROM certifications WHERE company_id = $1 AND status = 'active'
            )`,
        [cert.company_id]
      )
      const userRow = await query(
        `SELECT u.email, u.name, co.company_name
           FROM companies co JOIN users u ON u.id = co.user_id
          WHERE co.id = $1 LIMIT 1`,
        [cert.company_id]
      )
      if (userRow.rows.length && userRow.rows[0].email) {
        const { email, name, company_name } = userRow.rows[0]
        await sendCertExpired({
          email, name, companyName: company_name,
          level: cert.level, renewUrl: `${frontendUrl}/dashboard`,
        }).catch(() => {})
      }
    }
    console.log(JSON.stringify({ event: 'certs_expired', count: expired.rows.length }))
  } catch (e) {
    console.error(JSON.stringify({ event: 'cert_expiry.error', err: e.message }))
  }
}

// ── PII retention enforcement ─────────────────────────────────────────────────
// Removes rows that exceed configured retention windows.
// Configurable via env vars so staging can use shorter windows for testing.
//
//   RETENTION_API_KEY_USAGE_DAYS  default 90  — api_key_usage rows older than N days
//   RETENTION_AUDIT_LOG_DAYS      default 730 — audit_log rows older than N days (2 yr)
//
// Soft-deleted user data (anonymised email = *@deleted.invalid) is purged
// from the audit_log after the window to close the last PII vector.
const runPiiRetention = async () => {
  try {
    const apiKeyUsageDays = parseInt(process.env.RETENTION_API_KEY_USAGE_DAYS || '90', 10)
    const auditLogDays    = parseInt(process.env.RETENTION_AUDIT_LOG_DAYS    || '730', 10)

    // 1. Purge old API key usage counters (non-sensitive, but keeps the table lean)
    const r1 = await query(
      `DELETE FROM api_key_usage WHERE day < CURRENT_DATE - $1::int`,
      [apiKeyUsageDays]
    )

    // 2. Purge audit log rows belonging to fully anonymised (deleted) accounts
    //    that are older than the retention window.  Active accounts are kept.
    const r2 = await query(
      `DELETE FROM audit_log
        WHERE created_at < NOW() - ($1 || ' days')::interval
          AND user_id IN (
            SELECT id FROM users WHERE email LIKE '%@deleted.invalid'
          )`,
      [auditLogDays]
    )

    if ((r1.rowCount + r2.rowCount) > 0) {
      console.log(JSON.stringify({
        event:           'pii_retention_run',
        api_key_usage:   r1.rowCount,
        audit_log:       r2.rowCount,
        retentionDays:   { apiKeyUsage: apiKeyUsageDays, auditLog: auditLogDays },
      }))
    }
  } catch (e) {
    console.error(JSON.stringify({ event: 'pii_retention.error', err: e.message }))
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const startCronJobs = () => {
  // Token cleanup — runs immediately, then every hour
  runTokenCleanup()
  setInterval(runTokenCleanup, 60 * 60 * 1000)

  // Renewal reminders — delayed 5 min from boot, then every 24 h
  setTimeout(runRenewalReminders,   5 * 60 * 1000)
  setInterval(runRenewalReminders, 24 * 60 * 60 * 1000)

  // Urgent reminders — delayed 7 min from boot, then every 24 h
  setTimeout(runUrgentReminders,   7 * 60 * 1000)
  setInterval(runUrgentReminders, 24 * 60 * 60 * 1000)

  // Cert expiry cleanup — delayed 10 min from boot, then every 24 h
  setTimeout(runCertExpiryCleanup,  10 * 60 * 1000)
  setInterval(runCertExpiryCleanup, 24 * 60 * 60 * 1000)

  // PII retention — delayed 15 min from boot, then every 24 h
  setTimeout(runPiiRetention,  15 * 60 * 1000)
  setInterval(runPiiRetention, 24 * 60 * 60 * 1000)
}

module.exports = { startCronJobs, runPiiRetention }
