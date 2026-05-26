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
 *  - PAC bonus M+1       — 1st of month at 02:00 UTC (computes supervision bonuses)
 *  - Renewal reminder    — every 24 h  (D-30 email for certs expiring in 25-35 days)
 *  - Urgent reminder     — every 24 h  (D-7 email for certs expiring in 5-7 days)
 *  - Cert expiry         — every 24 h  (marks active→expired, revokes cert level)
 *  - PII retention       — every 24 h  (purge api_key_usage >90d, audit_log >2yr)
 */

const { query }                              = require('../db')
const { sendRenewalReminder, sendCertExpired, sendSupervisionTaskReminder } = require('./mailer')
const { dispatchWebhook } = require('./webhookDispatch')

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
      // Webhook fan-out (fire-and-forget)
      dispatchWebhook('cert.expired', { companyId: cert.company_id, level: cert.level, status: 'expired', certId: cert.id })
      dispatchWebhook('cert.status_changed', { companyId: cert.company_id, level: cert.level, oldStatus: 'active', newStatus: 'expired', certId: cert.id })
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
// ── PAC supervision weekly reminders ─────────────────────────────────────────
const runPacSupervisionReminders = async () => {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const TASK_LABELS = {
    weekly_checkin:            'Check-in individuel avec chaque S1',
    weekly_report_review:      'Revue des rapports S1 + feedback',
    weekly_mentoring:          'Mentoring individuel S2',
    weekly_spot_check:         'Audit spot-check 2 rapports S1 aléatoires',
    monthly_supervision_report:'Rapport de supervision mensuel',
    monthly_training:          'Session de formation collective',
    monthly_executive_report:  'Rapport exécutif mensuel',
    monthly_strategic_session: 'Session stratégique avec B&E HQ',
  }

  try {
    // Get all active S2/S3 supervisors with their email + task completion
    const { rows: supervisors } = await query(`
      SELECT pp.id AS pac_id, pp.pac_tier, pp.user_id, u.email, u.name,
             pp.membership_active
      FROM pac_profiles pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.pac_tier IN ('S2','S3')
        AND pp.kyc_status = 'approved'
        AND pp.membership_active = TRUE
    `)

    for (const sup of supervisors) {
      // Count active supervisees — skip if below minimum
      const { rows: activeRows } = await query(
        `SELECT COUNT(*) AS cnt FROM pac_supervision WHERE supervisor_id = $1 AND status = 'active'`,
        [sup.pac_id]
      )
      if (parseInt(activeRows[0].cnt, 10) === 0) continue

      // Get task completion for this month
      const { rows: taskRows } = await query(`
        SELECT task_type, completed FROM pac_supervision_tasks
        WHERE supervisor_id = $1 AND period_year = $2 AND period_month = $3
      `, [sup.pac_id, year, month])

      const weeklyTemplates = sup.pac_tier === 'S2'
        ? ['weekly_checkin', 'weekly_report_review']
        : ['weekly_mentoring', 'weekly_spot_check']

      const completedTypes = new Set(taskRows.filter(t => t.completed).map(t => t.task_type))
      const pendingTasks = weeklyTemplates
        .filter(t => !completedTypes.has(t))
        .map(t => TASK_LABELS[t] || t)

      const total = taskRows.length
      const done  = taskRows.filter(t => t.completed).length
      const pct   = total > 0 ? Math.round(done / total * 100) : 0
      const bonusStatus = pct >= 80 ? 'full' : pct >= 70 ? 'half' : 'suspended'

      await sendSupervisionTaskReminder({
        email:         sup.email,
        name:          sup.name,
        tier:          sup.pac_tier,
        pendingTasks,
        completionPct: pct,
        bonusStatus,
      })

      // Also create in-app notification
      if (pendingTasks.length > 0) {
        await query(`
          INSERT INTO notifications (user_id, type, title, body)
          VALUES ($1, 'warning', $2, $3)
        `, [
          sup.user_id,
          `[${sup.pac_tier}] ${pendingTasks.length} tâche(s) de supervision en attente`,
          `Cette semaine : ${pendingTasks.join(' · ')}`
        ]).catch(() => {})
      }
    }

    console.log(JSON.stringify({ event: 'pac_supervision_reminders_sent', count: supervisors.length, year, month }))
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_supervision_reminders_error', message: err.message }))
  }
}

// Schedule every Monday at 09:00 UTC
function schedulePacSupervisionReminders () {
  const now     = new Date()
  const nextMon = new Date(now)
  // Days until next Monday (1 = Monday in getDay())
  const daysUntilMon = (8 - now.getUTCDay()) % 7 || 7
  nextMon.setUTCDate(now.getUTCDate() + daysUntilMon)
  nextMon.setUTCHours(9, 0, 0, 0)

  const delay = nextMon.getTime() - Date.now()
  console.log(JSON.stringify({ event: 'pac_reminder_cron_scheduled', next_run: nextMon.toISOString() }))

  setTimeout(async () => {
    await runPacSupervisionReminders()
    setInterval(runPacSupervisionReminders, 7 * 24 * 60 * 60 * 1000)  // then every 7 days
  }, delay)
}

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

  // PAC bonus M+1 — scheduled for 1st of next month at 02:00 UTC
  const { schedulePacBonusCron } = require('./pacBonusCron')
  schedulePacBonusCron()

  // PAC supervision task reminders — every Monday at 09:00 UTC
  schedulePacSupervisionReminders()
}

module.exports = { startCronJobs, runPiiRetention }
