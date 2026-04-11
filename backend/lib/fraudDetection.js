'use strict'

const { query } = require('../db')

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'trashmail.com', '10minutemail.com', 'sharklasers.com',
  'guerrillamailblock.com', 'fakeinbox.com', 'mailnull.com', 'spamgourmet.com',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'spam4.me',
])

/**
 * Level 1 fraud rules (rules-based, synchronous/DB checks).
 * Returns array of triggered alerts (may be empty).
 * Side-effects: persists alerts to fraud_alerts table.
 *
 * @param {{ userId, email, ip, action, companyId, stripeRiskLevel, stripeDisputed }} ctx
 */
const checkFraud = async ({ userId, email, ip, action, companyId, stripeRiskLevel, stripeDisputed }) => {
  const triggered = []

  // Rule 1 — Disposable email domain
  if (email) {
    const domain = (email.split('@')[1] || '').toLowerCase()
    if (DISPOSABLE_DOMAINS.has(domain)) {
      triggered.push({ rule: 'disposable_email', severity: 'medium' })
    }
  }

  // Rule 2 — Checkout attempted without company profile
  if (action === 'checkout_session' && companyId == null) {
    triggered.push({ rule: 'no_company_profile', severity: 'low' })
  }

  // Rule 3 — Rapid company profile changes (> 3 in 24 h)
  if (action === 'company_profile_update' && userId != null) {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const res = await query(
      `SELECT COUNT(*) FROM audit_log
       WHERE user_id = $1 AND action = 'company_profile_update' AND created_at > $2`,
      [userId, since],
    ).catch(() => ({ rows: [{ count: '0' }] }))
    if (parseInt(res.rows[0].count, 10) >= 3) {
      triggered.push({ rule: 'rapid_profile_change', severity: 'medium' })
    }
  }

  // Rule 4 — Same IP used by > 3 distinct users in 24 h
  if (ip) {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const res = await query(
      `SELECT COUNT(DISTINCT user_id) FROM audit_log
       WHERE ip_address = $1 AND created_at > $2`,
      [ip, since],
    ).catch(() => ({ rows: [{ count: '0' }] }))
    if (parseInt(res.rows[0].count, 10) > 3) {
      triggered.push({ rule: 'ip_multi_account', severity: 'high' })
    }
  }

  // Rule 5 — Multiple failed login attempts within 15 min (> 5)
  if (action === 'login_fail' && userId != null) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const res = await query(
      `SELECT COUNT(*) FROM audit_log
       WHERE user_id = $1 AND action = 'login_fail' AND created_at > $2`,
      [userId, since],
    ).catch(() => ({ rows: [{ count: '0' }] }))
    if (parseInt(res.rows[0].count, 10) >= 5) {
      triggered.push({ rule: 'brute_force_login', severity: 'high' })
    }
  }

  // Rule 6 — Stripe Radar elevated/highest risk signal
  if (action === 'stripe_webhook' && (stripeRiskLevel === 'elevated' || stripeRiskLevel === 'highest')) {
    triggered.push({ rule: 'stripe_radar_risk', severity: stripeRiskLevel === 'highest' ? 'high' : 'medium' })
  }

  // Rule 7 — Stripe charge disputed
  if (action === 'stripe_webhook' && stripeDisputed === true) {
    triggered.push({ rule: 'stripe_charge_disputed', severity: 'high' })
  }

  // Persist all triggered alerts
  for (const alert of triggered) {
    await query(
      `INSERT INTO fraud_alerts (user_id, company_id, rule, severity) VALUES ($1, $2, $3, $4)`,
      [userId || null, companyId || null, alert.rule, alert.severity],
    ).catch(e => console.error('fraud_alerts insert failed:', e.message))
  }

  return triggered
}

const RULES = [
  { id: 'disposable_email',    severity: 'medium', label: 'Disposable email domain detected' },
  { id: 'no_company_profile',  severity: 'low',    label: 'Checkout attempted without company profile' },
  { id: 'rapid_profile_change',severity: 'medium', label: 'Rapid company profile changes (> 3 in 24 h)' },
  { id: 'ip_multi_account',    severity: 'high',   label: 'Single IP linked to > 3 accounts in 24 h' },
  { id: 'brute_force_login',   severity: 'high',   label: 'Multiple failed login attempts (> 5 in 15 min)' },
  { id: 'stripe_radar_risk',   severity: 'medium', label: 'Stripe Radar reported elevated/highest payment risk' },
  { id: 'stripe_charge_disputed', severity: 'high', label: 'Stripe charge disputed (chargeback signal)' },
]

module.exports = { checkFraud, RULES }
