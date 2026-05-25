'use strict'
/**
 * PAC Supervision Routes — v3.0
 *
 * POST   /api/pac/supervise            → S2/S3 requests to supervise a S1/S2
 * GET    /api/pac/supervision/team     → list my supervisees + their stats
 * GET    /api/pac/supervision/org      → S3: full org tree (S2s + their S1s)
 * GET    /api/pac/supervision/tasks    → my task checklist for current period
 * POST   /api/pac/supervision/tasks/:taskType → mark a task completed
 * GET    /api/pac/supervision/bonus    → my bonus history + current estimate
 * GET    /api/pac/supervision/simulator → project future bonus earnings
 *
 * Admin:
 * GET    /api/pac/admin/supervision/pending    → pending supervision requests
 * POST   /api/pac/admin/supervision/:id/approve
 * POST   /api/pac/admin/supervision/:id/reject
 * GET    /api/pac/admin/bonus/statements       → all bonus statements for M
 * POST   /api/pac/admin/bonus/:id/validate
 * POST   /api/pac/admin/bonus/:id/pay
 */

const express  = require('express')
const router   = express.Router()
const { query } = require('../db')
const { auth, requireAdmin } = require('../lib/auth')
const rateLimit = require('express-rate-limit')
const { logAudit } = require('../lib/audit')

const pacLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })

// ── Helper: get PAC profile for current user ─────────────────────────────────
async function getPacProfile (userId) {
  const r = await query('SELECT * FROM pac_profiles WHERE user_id = $1 LIMIT 1', [userId])
  return r.rows[0] || null
}

// ── Tier capacities ───────────────────────────────────────────────────────────
const MAX_SUPERVISED = { S2: 10, S3: 5 }  // S3 supervises max 5 S2s directly
const BONUS_RATE     = { L1: 0.05, L2: 0.02 }
const COMMISSION_RATE = { S1: 0.10, S2: 0.15, S3: 0.20 }

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pac/supervise
// S2 requests to supervise a S1, or S3 requests to supervise a S2
// ─────────────────────────────────────────────────────────────────────────────
router.post('/supervise', auth, pacLimiter, async (req, res) => {
  try {
    const { supervised_user_id } = req.body
    if (!supervised_user_id) return res.status(400).json({ error: 'supervised_user_id required' })

    const supervisor = await getPacProfile(req.user.id)
    if (!supervisor) return res.status(403).json({ error: 'PAC profile not found' })
    if (!['S2', 'S3'].includes(supervisor.pac_tier)) {
      return res.status(403).json({ error: 'Only S2 and S3 agents can supervise' })
    }
    if (supervisor.kyc_status !== 'approved') {
      return res.status(403).json({ error: 'KYC must be approved before supervising' })
    }

    const supervised = await getPacProfile(supervised_user_id)
    if (!supervised) return res.status(404).json({ error: 'Target PAC profile not found' })

    // Tier validation: S2 can only supervise S1, S3 can only supervise S2
    const allowedTarget = supervisor.pac_tier === 'S2' ? 'S1' : 'S2'
    if (supervised.pac_tier !== allowedTarget) {
      return res.status(400).json({ error: `${supervisor.pac_tier} can only supervise ${allowedTarget} agents` })
    }

    // Check capacity
    const activeCount = await query(
      `SELECT COUNT(*) FROM pac_supervision
       WHERE supervisor_id = $1 AND status = 'active'`,
      [supervisor.id]
    )
    const current = parseInt(activeCount.rows[0].count, 10)
    if (current >= MAX_SUPERVISED[supervisor.pac_tier]) {
      return res.status(400).json({
        error: `Maximum supervision capacity reached (${MAX_SUPERVISED[supervisor.pac_tier]} for ${supervisor.pac_tier})`
      })
    }

    // Check not already supervised by someone else
    const existing = await query(
      `SELECT id, status FROM pac_supervision WHERE supervised_id = $1 AND status IN ('pending','active')`,
      [supervised.id]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This agent is already under supervision or has a pending request' })
    }

    const ins = await query(
      `INSERT INTO pac_supervision (supervisor_id, supervised_id, supervisor_tier)
       VALUES ($1, $2, $3) RETURNING *`,
      [supervisor.id, supervised.id, supervisor.pac_tier]
    )

    logAudit(req.user.id, 'pac_supervision_request', 'pac_supervision', req.ip, {
      supervisor_tier: supervisor.pac_tier,
      supervised_pac_id: supervised.id
    })

    res.status(201).json({ supervision: ins.rows[0], message: 'Supervision request submitted — pending B&E admin approval' })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_supervise_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pac/supervision/team
// My direct supervisees + their mission stats this month
// ─────────────────────────────────────────────────────────────────────────────
router.get('/supervision/team', auth, pacLimiter, async (req, res) => {
  try {
    const pac = await getPacProfile(req.user.id)
    if (!pac) return res.status(403).json({ error: 'PAC profile not found' })

    const { rows } = await query(`
      SELECT
        ps.id                  AS supervision_id,
        ps.status              AS supervision_status,
        ps.approved_at,
        pp.id                  AS pac_id,
        pp.pac_tier,
        pp.full_name,
        pp.location,
        pp.supervision_score,
        u.email,
        -- Missions this month
        COUNT(m.id) FILTER (WHERE date_trunc('month', m.completed_at) = date_trunc('month', NOW())
          AND m.status = 'completed' AND m.payment_confirmed_at IS NOT NULL)  AS missions_completed_month,
        -- Gross revenue this month (for bonus preview)
        COALESCE(SUM(m.fee_usd) FILTER (
          WHERE date_trunc('month', m.completed_at) = date_trunc('month', NOW())
          AND m.status = 'completed' AND m.payment_confirmed_at IS NOT NULL
        ), 0) * 100             AS gross_revenue_cents_month,
        -- Total missions ever
        COUNT(m.id) FILTER (WHERE m.status = 'completed' AND m.payment_confirmed_at IS NOT NULL) AS missions_total
      FROM pac_supervision ps
      JOIN pac_profiles pp ON pp.id = ps.supervised_id
      JOIN users u          ON u.id = pp.user_id
      LEFT JOIN missions m  ON m.assigned_to = pp.user_id
      WHERE ps.supervisor_id = $1
      GROUP BY ps.id, ps.status, ps.approved_at, pp.id, pp.pac_tier, pp.full_name, pp.location, pp.supervision_score, u.email
      ORDER BY ps.status, pp.full_name
    `, [pac.id])

    // Compute estimated bonus for current month (preview)
    const activeRows = rows.filter(r => r.supervision_status === 'active')
    const grossRevenueCents = activeRows.reduce((s, r) => s + parseInt(r.gross_revenue_cents_month, 10), 0)
    const commissionsCents  = activeRows.reduce((s, r) => {
      const rate = COMMISSION_RATE[r.pac_tier] || 0.10
      return s + Math.round(parseInt(r.gross_revenue_cents_month, 10) * rate)
    }, 0)
    const netBECents  = grossRevenueCents - commissionsCents
    const bonusPreviewCents = Math.round(netBECents * BONUS_RATE.L1)

    res.json({
      team: rows,
      preview: {
        month: new Date().toISOString().slice(0, 7),
        gross_revenue_cents: grossRevenueCents,
        commissions_cents: commissionsCents,
        net_be_cents: netBECents,
        bonus_rate: BONUS_RATE.L1,
        estimated_bonus_cents: bonusPreviewCents,
        note: 'Paid M+1 after admin validation + client payment confirmed'
      }
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_team_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pac/supervision/org — S3 full org tree
// ─────────────────────────────────────────────────────────────────────────────
router.get('/supervision/org', auth, pacLimiter, async (req, res) => {
  try {
    const pac = await getPacProfile(req.user.id)
    if (!pac || pac.pac_tier !== 'S3') return res.status(403).json({ error: 'S3 only' })

    // Get direct S2s
    const s2s = await query(`
      SELECT pp.id, pp.full_name, pp.location, pp.supervision_score, u.email,
             ps.status AS supervision_status, ps.approved_at
      FROM pac_supervision ps
      JOIN pac_profiles pp ON pp.id = ps.supervised_id
      JOIN users u ON u.id = pp.user_id
      WHERE ps.supervisor_id = $1 AND pp.pac_tier = 'S2'
      ORDER BY pp.full_name
    `, [pac.id])

    // For each S2, get their S1s
    const orgTree = await Promise.all(s2s.rows.map(async s2 => {
      const s1s = await query(`
        SELECT pp.id, pp.full_name, pp.location, pp.supervision_score, u.email,
               ps.status AS supervision_status,
               COUNT(m.id) FILTER (WHERE m.status='completed' AND m.payment_confirmed_at IS NOT NULL) AS missions_total
        FROM pac_supervision ps
        JOIN pac_profiles pp ON pp.id = ps.supervised_id
        JOIN users u ON u.id = pp.user_id
        LEFT JOIN missions m ON m.assigned_to = pp.user_id
        WHERE ps.supervisor_id = $1 AND pp.pac_tier = 'S1'
        GROUP BY pp.id, pp.full_name, pp.location, pp.supervision_score, u.email, ps.status
        ORDER BY pp.full_name
      `, [s2.id])
      return { ...s2, s1s: s1s.rows }
    }))

    // Summary stats for S3 bonus preview
    const now = new Date()
    const monthBonusStats = await query(`
      SELECT
        COALESCE(SUM(m.fee_usd),0)*100 AS gross_cents,
        COALESCE(SUM(m.commission_amount_cents),0) AS commissions_cents
      FROM missions m
      JOIN pac_profiles pp ON pp.user_id = m.assigned_to
      JOIN pac_supervision ps ON ps.supervised_id = pp.id
      WHERE ps.supervisor_id = $1
        AND date_trunc('month', m.completed_at) = date_trunc('month', NOW())
        AND m.status = 'completed' AND m.payment_confirmed_at IS NOT NULL
    `, [pac.id])

    const stats = monthBonusStats.rows[0]
    const netBEL1 = parseInt(stats.gross_cents, 10) - parseInt(stats.commissions_cents, 10)

    res.json({
      pac_tier: 'S3',
      s2s: orgTree,
      total_s2s: orgTree.length,
      total_s1s: orgTree.reduce((s, s2) => s + s2.s1s.length, 0),
      preview_month: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
      estimated_bonus_l1_cents: Math.round(netBEL1 * BONUS_RATE.L1),
      estimated_bonus_l2_cents: 0, // computed separately (all S1s in org)
      note: 'Bonus paid M+1 after admin validation'
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_org_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pac/supervision/tasks
// My task checklist for current month/week
// ─────────────────────────────────────────────────────────────────────────────
router.get('/supervision/tasks', auth, pacLimiter, async (req, res) => {
  try {
    const pac = await getPacProfile(req.user.id)
    if (!pac) return res.status(403).json({ error: 'PAC profile not found' })

    const now    = new Date()
    const year   = now.getFullYear()
    const month  = now.getMonth() + 1
    // ISO week number
    const startOfYear = new Date(year, 0, 1)
    const week   = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)

    const { rows } = await query(`
      SELECT * FROM pac_supervision_tasks
      WHERE supervisor_id = $1 AND period_year = $2 AND period_month = $3
      ORDER BY task_type, period_week NULLS LAST
    `, [pac.id, year, month])

    // Build expected tasks based on tier
    const taskTemplates = pac.pac_tier === 'S2'
      ? ['weekly_checkin', 'weekly_report_review', 'monthly_supervision_report', 'monthly_training']
      : ['weekly_mentoring', 'weekly_spot_check', 'monthly_executive_report', 'monthly_strategic_session']

    // Compute completion %
    const weeklyTasks  = rows.filter(t => t.period_week !== null)
    const monthlyTasks = rows.filter(t => t.period_week === null)
    const totalExpected = weeklyTasks.length + monthlyTasks.length
    const completed     = rows.filter(t => t.completed).length
    const completionPct = totalExpected > 0 ? Math.round(completed / totalExpected * 100) : 0

    const bonusMultiplier = completionPct >= 80 ? 1.0 : completionPct >= 70 ? 0.5 : 0

    res.json({
      period: { year, month, current_week: week },
      tasks: rows,
      task_templates: taskTemplates,
      summary: {
        total_tasks: totalExpected,
        completed_tasks: completed,
        completion_pct: completionPct,
        bonus_multiplier: bonusMultiplier,
        bonus_status: bonusMultiplier === 1.0 ? 'full' : bonusMultiplier === 0.5 ? 'half' : 'suspended'
      }
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_tasks_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pac/supervision/tasks/:taskType
// Mark a supervision task as completed
// ─────────────────────────────────────────────────────────────────────────────
router.post('/supervision/tasks/:taskType', auth, pacLimiter, async (req, res) => {
  try {
    const pac = await getPacProfile(req.user.id)
    if (!pac) return res.status(403).json({ error: 'PAC profile not found' })

    const { taskType } = req.params
    const { notes, evidence_url, period_week } = req.body

    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    const validTypes = [
      'weekly_checkin','weekly_report_review','weekly_mentoring','weekly_spot_check',
      'monthly_supervision_report','monthly_training','monthly_executive_report',
      'monthly_strategic_session','quarterly_s2_evaluation','ad_hoc_escalation'
    ]
    if (!validTypes.includes(taskType)) {
      return res.status(400).json({ error: 'Invalid task type' })
    }

    const result = await query(`
      INSERT INTO pac_supervision_tasks
        (supervisor_id, period_year, period_month, period_week, task_type, completed, completed_at, notes, evidence_url)
      VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), $6, $7)
      ON CONFLICT (supervisor_id, period_year, period_month, period_week, task_type)
      DO UPDATE SET completed = TRUE, completed_at = NOW(), notes = EXCLUDED.notes, evidence_url = EXCLUDED.evidence_url
      RETURNING *
    `, [pac.id, year, month, period_week || null, taskType, notes || null, evidence_url || null])

    logAudit(req.user.id, 'pac_task_completed', 'pac_supervision_tasks', req.ip, { taskType, year, month })
    res.json({ task: result.rows[0] })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_task_complete_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pac/supervision/bonus
// My bonus history + current month estimate
// ─────────────────────────────────────────────────────────────────────────────
router.get('/supervision/bonus', auth, pacLimiter, async (req, res) => {
  try {
    const pac = await getPacProfile(req.user.id)
    if (!pac) return res.status(403).json({ error: 'PAC profile not found' })

    const history = await query(`
      SELECT * FROM pac_bonus_payouts
      WHERE supervisor_id = $1
      ORDER BY period_year DESC, period_month DESC
      LIMIT 24
    `, [pac.id])

    const totalPaidCents = history.rows
      .filter(r => r.status === 'paid')
      .reduce((s, r) => s + (r.final_bonus_cents || 0), 0)

    res.json({
      pac_tier: pac.pac_tier,
      history: history.rows,
      total_paid_cents: totalPaidCents,
      total_paid_usd: (totalPaidCents / 100).toFixed(2)
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_bonus_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pac/supervision/simulator
// Project future earnings given N supervisees doing X missions at Y avg value
// ─────────────────────────────────────────────────────────────────────────────
router.get('/supervision/simulator', auth, pacLimiter, async (req, res) => {
  try {
    const pac = await getPacProfile(req.user.id)
    if (!pac || !['S2','S3'].includes(pac.pac_tier)) {
      return res.status(403).json({ error: 'S2 or S3 only' })
    }

    const {
      supervisees    = pac.pac_tier === 'S2' ? 10 : 5,
      missions_month = pac.pac_tier === 'S2' ? 4  : 8,
      avg_fee_usd    = pac.pac_tier === 'S2' ? 499 : 999,
      supervisee_tier = pac.pac_tier === 'S2' ? 'S1' : 'S2'
    } = req.query

    const n         = Math.min(parseInt(supervisees, 10), MAX_SUPERVISED[pac.pac_tier])
    const mPerAgent = parseInt(missions_month, 10)
    const avgFee    = parseInt(avg_fee_usd, 10)
    const commRate  = COMMISSION_RATE[supervisee_tier] || 0.10

    const totalMissions   = n * mPerAgent
    const grossRevMonth   = totalMissions * avgFee
    const commissionsMonth = Math.round(grossRevMonth * commRate)
    const netBEMonth      = grossRevMonth - commissionsMonth
    const bonusMonth      = Math.round(netBEMonth * BONUS_RATE.L1)
    const bonusAnnual     = bonusMonth * 12

    res.json({
      inputs: { supervisees: n, missions_per_agent_month: mPerAgent, avg_fee_usd: avgFee, supervisee_tier },
      monthly: {
        total_missions: totalMissions,
        gross_revenue_usd: grossRevMonth,
        commissions_usd: commissionsMonth,
        net_be_revenue_usd: netBEMonth,
        bonus_rate: BONUS_RATE.L1,
        estimated_bonus_usd: bonusMonth
      },
      annual: { estimated_bonus_usd: bonusAnnual },
      note: 'Bonus paid M+1 after admin validation. Requires ≥80% task completion for full bonus.'
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_simulator_error', message: err.message }))
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — supervision request management
// ─────────────────────────────────────────────────────────────────────────────

router.get('/admin/supervision/pending', auth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        ps.*,
        sup_pp.pac_tier  AS supervisor_tier_profile,
        sup_pp.full_name AS supervisor_name,
        sup_u.email      AS supervisor_email,
        sub_pp.pac_tier  AS supervised_tier,
        sub_pp.full_name AS supervised_name,
        sub_u.email      AS supervised_email
      FROM pac_supervision ps
      JOIN pac_profiles sup_pp ON sup_pp.id = ps.supervisor_id
      JOIN users sup_u         ON sup_u.id  = sup_pp.user_id
      JOIN pac_profiles sub_pp ON sub_pp.id = ps.supervised_id
      JOIN users sub_u         ON sub_u.id  = sub_pp.user_id
      WHERE ps.status = 'pending'
      ORDER BY ps.requested_at ASC
    `)
    res.json({ requests: rows })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/admin/supervision/:id/approve', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { rows } = await query(`
      UPDATE pac_supervision
      SET status = 'active', approved_at = NOW(), approved_by = $2
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [id, req.user.id])

    if (!rows.length) return res.status(404).json({ error: 'Request not found or already processed' })

    logAudit(req.user.id, 'pac_supervision_approved', 'pac_supervision', req.ip, { supervision_id: id })
    res.json({ supervision: rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/admin/supervision/:id/reject', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const { rows } = await query(`
      UPDATE pac_supervision
      SET status = 'terminated', terminated_at = NOW(), terminated_reason = $2
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [id, reason || 'Rejected by admin'])

    if (!rows.length) return res.status(404).json({ error: 'Request not found or already processed' })
    logAudit(req.user.id, 'pac_supervision_rejected', 'pac_supervision', req.ip, { supervision_id: id, reason })
    res.json({ supervision: rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — bonus statement management
// ─────────────────────────────────────────────────────────────────────────────

router.get('/admin/bonus/statements', auth, requireAdmin, async (req, res) => {
  try {
    const { year, month, status } = req.query
    const now  = new Date()
    const y    = parseInt(year || now.getFullYear(), 10)
    const m    = parseInt(month || now.getMonth() + 1, 10)

    const { rows } = await query(`
      SELECT pb.*, pp.full_name, pp.pac_tier, u.email
      FROM pac_bonus_payouts pb
      JOIN pac_profiles pp ON pp.id = pb.supervisor_id
      JOIN users u          ON u.id  = pp.user_id
      WHERE pb.period_year = $1 AND pb.period_month = $2
        AND ($3::text IS NULL OR pb.status = $3)
      ORDER BY pb.status, pp.pac_tier, pp.full_name
    `, [y, m, status || null])

    const totalDraftCents = rows.filter(r=>r.status==='draft').reduce((s,r)=>s+(r.final_bonus_cents||0),0)
    const totalValidatedCents = rows.filter(r=>r.status==='validated').reduce((s,r)=>s+(r.final_bonus_cents||0),0)

    res.json({
      period: { year: y, month: m },
      statements: rows,
      summary: {
        total_draft_usd: (totalDraftCents / 100).toFixed(2),
        total_validated_usd: (totalValidatedCents / 100).toFixed(2),
        count: rows.length
      }
    })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/admin/bonus/:id/validate', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { rows } = await query(`
      UPDATE pac_bonus_payouts
      SET status = 'validated', validated_by = $2, validated_at = NOW()
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `, [id, req.user.id])
    if (!rows.length) return res.status(404).json({ error: 'Statement not found or already validated' })
    logAudit(req.user.id, 'pac_bonus_validated', 'pac_bonus_payouts', req.ip, { payout_id: id })
    res.json({ payout: rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/admin/bonus/:id/pay', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { payment_reference, notes } = req.body
    if (!payment_reference) return res.status(400).json({ error: 'payment_reference required (SWIFT/SEPA ref)' })

    const { rows } = await query(`
      UPDATE pac_bonus_payouts
      SET status = 'paid', paid_at = NOW(), payment_reference = $2, notes = $3
      WHERE id = $1 AND status = 'validated'
      RETURNING *
    `, [id, payment_reference, notes || null])
    if (!rows.length) return res.status(404).json({ error: 'Statement not found or not yet validated' })
    logAudit(req.user.id, 'pac_bonus_paid', 'pac_bonus_payouts', req.ip, { payout_id: id, payment_reference })
    res.json({ payout: rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
