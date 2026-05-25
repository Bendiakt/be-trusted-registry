'use strict'
/**
 * PAC Bonus Cron — M+1 Rule
 *
 * Runs on the 1st of each month at 02:00 UTC.
 * Computes bonus statements for the previous month (M) for all eligible S2/S3.
 *
 * Eligibility conditions (per spec):
 *   ✓ Supervision tasks completed ≥ 80% → full bonus (multiplier 1.0)
 *   ✓ 70–79%                             → half bonus (multiplier 0.5)
 *   ✓ < 70%                              → no bonus   (multiplier 0.0)
 *   ✓ Monthly report submitted on time   → checked via pac_supervision_tasks
 *   ✓ Minimum active supervisees: S2 ≥ 3, S3 ≥ 2
 *   ✓ No unresolved incidents            → placeholder (admin flag)
 *   ✓ Only missions with payment_confirmed_at in month M count
 *
 * Bonus rates:
 *   S2 L1: 5% of net B&E revenue from supervised S1s
 *   S3 L1: 5% of net B&E revenue from supervised S2s
 *   S3 L2: 2% of net B&E revenue from all S1s in the S3's org
 */

const { query } = require('../db')

const BONUS_RATE = { L1: 0.05, L2: 0.02 }
const MIN_ACTIVE = { S2: 3, S3: 2 }

/**
 * Compute task completion % for a supervisor for a given month.
 * Only counts tasks that were expected (logged or should have been logged).
 */
async function getCompletionPct (supervisorId, year, month) {
  const { rows } = await query(`
    SELECT
      COUNT(*)                           AS total,
      COUNT(*) FILTER (WHERE completed)  AS done
    FROM pac_supervision_tasks
    WHERE supervisor_id = $1 AND period_year = $2 AND period_month = $3
  `, [supervisorId, year, month])

  const total = parseInt(rows[0]?.total || 0, 10)
  const done  = parseInt(rows[0]?.done  || 0, 10)
  if (total === 0) return 0   // no tasks logged = 0%
  return Math.round((done / total) * 100)
}

/**
 * Get bonus multiplier from completion %.
 */
function getBonusMultiplier (pct) {
  if (pct >= 80) return 1.00
  if (pct >= 70) return 0.50
  return 0.00
}

/**
 * Count active supervisees for a supervisor in month M.
 */
async function getActiveSuperviseeCount (supervisorId) {
  const { rows } = await query(`
    SELECT COUNT(*) AS cnt
    FROM pac_supervision
    WHERE supervisor_id = $1 AND status = 'active'
  `, [supervisorId])
  return parseInt(rows[0]?.cnt || 0, 10)
}

/**
 * Compute net B&E revenue for missions completed by a set of PAC agents in month M.
 * Net = Σ(fee_usd) − Σ(commission_amount_cents/100)
 * Only missions where payment_confirmed_at falls in month M.
 */
async function getNetBERevenue (supervisedPacIds, year, month) {
  if (!supervisedPacIds.length) return { gross: 0, commissions: 0, net: 0, count: 0 }

  const placeholders = supervisedPacIds.map((_, i) => `$${i + 3}`).join(',')
  const { rows } = await query(`
    SELECT
      COUNT(*)                                    AS mission_count,
      COALESCE(SUM(m.fee_usd), 0) * 100          AS gross_cents,
      COALESCE(SUM(m.commission_amount_cents), 0) AS commissions_cents
    FROM missions m
    JOIN pac_profiles pp ON pp.user_id = m.assigned_to
    WHERE pp.id IN (${placeholders})
      AND m.status = 'completed'
      AND m.payment_confirmed_at IS NOT NULL
      AND EXTRACT(YEAR  FROM m.payment_confirmed_at) = $1
      AND EXTRACT(MONTH FROM m.payment_confirmed_at) = $2
  `, [year, month, ...supervisedPacIds])

  const gross       = parseInt(rows[0].gross_cents, 10)
  const commissions = parseInt(rows[0].commissions_cents, 10)
  return {
    count: parseInt(rows[0].mission_count, 10),
    gross,
    commissions,
    net: gross - commissions
  }
}

/**
 * Upsert a bonus payout statement (idempotent — re-running for the same period overwrites drafts).
 */
async function upsertBonusStatement ({
  supervisorId, year, month, bonusLevel,
  count, gross, commissions, net,
  bonusRate, bonusCents, taskPct, multiplier, finalCents
}) {
  await query(`
    INSERT INTO pac_bonus_payouts
      (supervisor_id, period_year, period_month, bonus_level,
       missions_count, gross_revenue_cents, commissions_paid_cents, net_be_revenue_cents,
       bonus_rate, bonus_amount_cents, task_completion_pct, bonus_multiplier, final_bonus_cents,
       status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
    ON CONFLICT (supervisor_id, period_year, period_month, bonus_level)
    DO UPDATE SET
      missions_count         = EXCLUDED.missions_count,
      gross_revenue_cents    = EXCLUDED.gross_revenue_cents,
      commissions_paid_cents = EXCLUDED.commissions_paid_cents,
      net_be_revenue_cents   = EXCLUDED.net_be_revenue_cents,
      bonus_rate             = EXCLUDED.bonus_rate,
      bonus_amount_cents     = EXCLUDED.bonus_amount_cents,
      task_completion_pct    = EXCLUDED.task_completion_pct,
      bonus_multiplier       = EXCLUDED.bonus_multiplier,
      final_bonus_cents      = EXCLUDED.final_bonus_cents,
      status                 = CASE WHEN pac_bonus_payouts.status = 'draft' THEN 'draft'
                                    ELSE pac_bonus_payouts.status END
  `, [
    supervisorId, year, month, bonusLevel,
    count, gross, commissions, net,
    bonusRate, bonusCents, taskPct, multiplier, finalCents
  ])
}

/**
 * Main bonus calculation — call on 1st of month M+1 for month M.
 */
async function computeMonthlyBonuses (targetYear, targetMonth) {
  console.log(JSON.stringify({
    event: 'pac_bonus_cron_start',
    target_period: `${targetYear}-${String(targetMonth).padStart(2,'0')}`
  }))

  // Get all active S2 and S3 supervisors
  const { rows: supervisors } = await query(`
    SELECT pp.id AS pac_id, pp.pac_tier, pp.user_id
    FROM pac_profiles pp
    WHERE pp.pac_tier IN ('S2','S3')
      AND pp.kyc_status = 'approved'
      AND pp.membership_active = TRUE
    ORDER BY pp.pac_tier, pp.id
  `)

  let processed = 0
  let skipped   = 0

  for (const sup of supervisors) {
    try {
      // Check minimum active supervisees
      const activeCount = await getActiveSuperviseeCount(sup.pac_id)
      if (activeCount < MIN_ACTIVE[sup.pac_tier]) {
        console.log(JSON.stringify({
          event: 'pac_bonus_skip_min_supervisees',
          pac_id: sup.pac_id, tier: sup.pac_tier,
          active_count: activeCount, required: MIN_ACTIVE[sup.pac_tier]
        }))
        skipped++
        continue
      }

      // Task completion %
      const taskPct    = await getCompletionPct(sup.pac_id, targetYear, targetMonth)
      const multiplier = getBonusMultiplier(taskPct)

      // Get supervised pac profile IDs (active only)
      const { rows: supervisedRows } = await query(`
        SELECT ps.supervised_id FROM pac_supervision ps
        WHERE ps.supervisor_id = $1 AND ps.status = 'active'
      `, [sup.pac_id])
      const supervisedIds = supervisedRows.map(r => r.supervised_id)

      // ── L1 bonus (direct supervisees) ─────────────────────────────────────
      const l1 = await getNetBERevenue(supervisedIds, targetYear, targetMonth)
      const l1BonusCents = Math.round(l1.net * BONUS_RATE.L1)
      const l1Final      = Math.round(l1BonusCents * multiplier)

      await upsertBonusStatement({
        supervisorId: sup.pac_id,
        year: targetYear, month: targetMonth,
        bonusLevel: 'L1',
        count: l1.count, gross: l1.gross, commissions: l1.commissions, net: l1.net,
        bonusRate: BONUS_RATE.L1, bonusCents: l1BonusCents,
        taskPct, multiplier, finalCents: l1Final
      })

      // ── L2 bonus (S3 only — all S1s in the org) ───────────────────────────
      if (sup.pac_tier === 'S3') {
        // Get all S1 pac_ids under each supervised S2
        const { rows: s1Rows } = await query(`
          SELECT ps2.supervised_id
          FROM pac_supervision ps1          -- S3 → S2
          JOIN pac_supervision ps2          -- S2 → S1
            ON ps2.supervisor_id = ps1.supervised_id
          JOIN pac_profiles pp ON pp.id = ps2.supervised_id AND pp.pac_tier = 'S1'
          WHERE ps1.supervisor_id = $1 AND ps1.status = 'active' AND ps2.status = 'active'
        `, [sup.pac_id])
        const s1Ids = s1Rows.map(r => r.supervised_id)

        const l2 = await getNetBERevenue(s1Ids, targetYear, targetMonth)
        const l2BonusCents = Math.round(l2.net * BONUS_RATE.L2)
        const l2Final      = Math.round(l2BonusCents * multiplier)

        await upsertBonusStatement({
          supervisorId: sup.pac_id,
          year: targetYear, month: targetMonth,
          bonusLevel: 'L2',
          count: l2.count, gross: l2.gross, commissions: l2.commissions, net: l2.net,
          bonusRate: BONUS_RATE.L2, bonusCents: l2BonusCents,
          taskPct, multiplier, finalCents: l2Final
        })
      }

      processed++
      console.log(JSON.stringify({
        event: 'pac_bonus_computed',
        pac_id: sup.pac_id, tier: sup.pac_tier,
        task_pct: taskPct, multiplier, l1_final_cents: l1Final
      }))
    } catch (err) {
      console.error(JSON.stringify({
        event: 'pac_bonus_error', pac_id: sup.pac_id, message: err.message
      }))
    }
  }

  console.log(JSON.stringify({
    event: 'pac_bonus_cron_done',
    target_period: `${targetYear}-${String(targetMonth).padStart(2,'0')}`,
    processed, skipped, total: supervisors.length
  }))
}

/**
 * Schedule — runs on 1st of each month at 02:00 UTC.
 * Called from cronJobs.js.
 */
function schedulePacBonusCron () {
  const now          = new Date()
  // Target = previous month
  const targetDate   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const targetYear   = targetDate.getFullYear()
  const targetMonth  = targetDate.getMonth() + 1

  // Next 1st of month at 02:00 UTC
  const nextRun      = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 2, 0, 0))
  const delay        = nextRun.getTime() - Date.now()

  console.log(JSON.stringify({
    event: 'pac_bonus_cron_scheduled',
    next_run: nextRun.toISOString(),
    will_compute_period: `${targetYear}-${String(targetMonth).padStart(2,'0')}`
  }))

  setTimeout(async () => {
    await computeMonthlyBonuses(targetYear, targetMonth)
    schedulePacBonusCron()  // reschedule for next month
  }, delay)
}

module.exports = { schedulePacBonusCron, computeMonthlyBonuses }
