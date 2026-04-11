'use strict'

const { query } = require('../db')

// 27 indicators with weights — max total = 100
const INDICATORS = [
  // ── Profile completeness (max 15) ──────────────────────────────────────────
  { id: 'has_name',         weight: 3,  label: 'Company name set' },
  { id: 'has_industry',     weight: 2,  label: 'Industry set' },
  { id: 'has_country',      weight: 2,  label: 'Country set' },
  { id: 'has_description',  weight: 4,  label: 'Full description provided' },
  { id: 'has_website',      weight: 4,  label: 'Website URL provided' },

  // ── Certification level (max 25) ───────────────────────────────────────────
  { id: 'cert_bronze',      weight: 5,  label: 'Bronze certification obtained' },
  { id: 'cert_silver',      weight: 10, label: 'Silver certification obtained' },
  { id: 'cert_gold',        weight: 10, label: 'Gold certification obtained' },

  // ── Payment record (max 15) ────────────────────────────────────────────────
  { id: 'payment_attempt',  weight: 2,  label: 'Payment attempted at least once' },
  { id: 'payment_success',  weight: 8,  label: 'Payment successfully completed' },
  { id: 'no_chargebacks',   weight: 3,  label: 'No chargebacks recorded' },
  { id: 'loyal_customer',   weight: 2,  label: 'Multi-level customer' },

  // ── Fraud signals (max 20) ─────────────────────────────────────────────────
  { id: 'no_alerts',        weight: 8,  label: 'No fraud alerts raised' },
  { id: 'no_recent_alerts', weight: 5,  label: 'No fraud alerts in last 30 days' },
  { id: 'no_high_alerts',   weight: 4,  label: 'No high/critical severity alerts' },
  { id: 'clean_ip',         weight: 2,  label: 'No IP multi-account flag' },
  { id: 'no_velocity',      weight: 1,  label: 'No profile velocity anomaly' },

  // ── Account age & quality (max 15) ────────────────────────────────────────
  { id: 'age_30d',          weight: 3,  label: 'Account older than 30 days' },
  { id: 'age_90d',          weight: 4,  label: 'Account older than 90 days' },
  { id: 'age_180d',         weight: 4,  label: 'Account older than 180 days' },
  { id: 'legit_email',      weight: 2,  label: 'Non-disposable email provider' },
  { id: 'email_quality',    weight: 2,  label: 'Business-grade email domain' },

  // ── Activity signals (max 10) ─────────────────────────────────────────────
  { id: 'active_30d',       weight: 3,  label: 'Activity recorded in last 30 days' },
  { id: 'active_7d',        weight: 2,  label: 'Activity recorded in last 7 days' },
  { id: 'profile_updated',  weight: 3,  label: 'Profile updated at least once' },
  { id: 'no_rapid_changes', weight: 1,  label: 'No suspicious rapid profile changes' },
  { id: 'normal_login',     weight: 1,  label: 'Login frequency within normal range' },
]

// Disposable / throwaway email domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'trashmail.com', '10minutemail.com', 'sharklasers.com',
  'guerrillamailblock.com', 'fakeinbox.com', 'mailnull.com', 'spamgourmet.com',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'spam4.me',
])

// Free / consumer domains (not disposable but lower trust than business)
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'pm.me',
])

/**
 * Compute the Trust Score (0–100) for a given userId.
 * Persists the result to the trust_scores table.
 * Returns { userId, companyId, score, riskLevel, details }
 */
const computeTrustScore = async (userId) => {
  const [userRes, companyRes, alertsRes, auditRes, ipFlagRes, velocityRes] = await Promise.all([
    query('SELECT id, email, created_at FROM users WHERE id = $1 LIMIT 1', [userId]),
    query('SELECT * FROM companies WHERE user_id = $1 LIMIT 1', [userId]),
    query('SELECT severity, created_at FROM fraud_alerts WHERE user_id = $1', [userId]),
    query(
      "SELECT created_at, action FROM audit_log WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC",
      [userId],
    ),
    query(
      "SELECT COUNT(*) FROM fraud_alerts WHERE user_id = $1 AND rule = 'ip_multi_account'",
      [userId],
    ),
    query(
      "SELECT COUNT(*) FROM fraud_alerts WHERE user_id = $1 AND rule IN ('rapid_profile_change','profile_velocity') AND created_at > NOW() - INTERVAL '7 days'",
      [userId],
    ),
  ])

  const user = userRes.rows[0]
  if (!user) return null

  const company = companyRes.rows[0] || null
  const alerts = alertsRes.rows
  const auditLogs = auditRes.rows

  const now = Date.now()
  const accountAgeDays = (now - new Date(user.created_at).getTime()) / 86_400_000
  const emailDomain = (user.email.split('@')[1] || '').toLowerCase()

  const recentAlerts = alerts.filter(a => (now - new Date(a.created_at).getTime()) < 30 * 86_400_000)
  const highAlerts = alerts.filter(a => a.severity === 'high' || a.severity === 'critical')

  const active30 = auditLogs.some(l => (now - new Date(l.created_at).getTime()) < 30 * 86_400_000)
  const active7 = auditLogs.some(l => (now - new Date(l.created_at).getTime()) < 7 * 86_400_000)

  const certLevel = company?.certification_level || 0
  const hasIpFlag = parseInt(ipFlagRes.rows[0].count, 10) > 0
  const hasVelocity = parseInt(velocityRes.rows[0].count, 10) > 0

  const indicators = {
    has_name:         Boolean(company?.name),
    has_industry:     Boolean(company?.industry),
    has_country:      Boolean(company?.country),
    has_description:  Boolean(company?.description),
    has_website:      Boolean(company?.website),
    cert_bronze:      certLevel >= 1,
    cert_silver:      certLevel >= 2,
    cert_gold:        certLevel >= 3,
    payment_attempt:  certLevel > 0,
    payment_success:  certLevel > 0,
    no_chargebacks:   true,                             // default; Stripe Radar integration deferred
    loyal_customer:   certLevel > 1,
    no_alerts:        alerts.length === 0,
    no_recent_alerts: recentAlerts.length === 0,
    no_high_alerts:   highAlerts.length === 0,
    clean_ip:         !hasIpFlag,
    no_velocity:      !hasVelocity,
    age_30d:          accountAgeDays >= 30,
    age_90d:          accountAgeDays >= 90,
    age_180d:         accountAgeDays >= 180,
    legit_email:      !DISPOSABLE_DOMAINS.has(emailDomain),
    email_quality:    !DISPOSABLE_DOMAINS.has(emailDomain) && !CONSUMER_DOMAINS.has(emailDomain),
    active_30d:       active30,
    active_7d:        active7,
    profile_updated:  Boolean(company?.updated_at),
    no_rapid_changes: !hasVelocity,
    normal_login:     true,
  }

  let score = 0
  const details = []
  for (const ind of INDICATORS) {
    const passed = Boolean(indicators[ind.id])
    const points = passed ? ind.weight : 0
    score += points
    details.push({ id: ind.id, label: ind.label, weight: ind.weight, passed, points })
  }

  const riskLevel = score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high'

  // Persist to trust_scores if company exists
  if (company) {
    await query(
      `INSERT INTO trust_scores (company_id, score, risk_level, indicators)
       VALUES ($1, $2, $3, $4)`,
      [company.id, score, riskLevel, JSON.stringify(indicators)],
    ).catch(e => console.error('trust_scores insert failed:', e.message))
  }

  return { userId, companyId: company?.id || null, score, riskLevel, details, indicators }
}

module.exports = { computeTrustScore, INDICATORS, DISPOSABLE_DOMAINS }
