-- Migration 014 — backfill achievement counters on pac_profiles from real mission data
-- Safe to re-run: only updates rows where missions_completed = 0 (no counter yet).
-- This ensures agents promoted before the counter hookups (PR #82) are not missed.
-- Applied by: npm run migrate (Railway preDeployCommand)

UPDATE pac_profiles pp
SET
  missions_completed    = sub.completed,
  missions_on_time      = sub.on_time,
  l2_missions_completed = sub.l2,
  admin_score_total     = sub.score_total,
  admin_score_count     = sub.score_count,
  updated_at            = NOW()
FROM (
  SELECT
    m.assigned_to                                    AS user_id,
    COUNT(*) FILTER (WHERE m.status = 'completed')   AS completed,
    COUNT(*) FILTER (
      WHERE m.status = 'completed'
        AND (m.due_date IS NULL OR m.completed_at::date <= m.due_date)
    )                                                AS on_time,
    COUNT(*) FILTER (
      WHERE m.status = 'completed'
        AND m.pac_tier_required IN ('S2','S3')
    )                                                AS l2,
    COALESCE(SUM(m.admin_score) FILTER (WHERE m.admin_score IS NOT NULL), 0) AS score_total,
    COUNT(*)  FILTER (WHERE m.admin_score IS NOT NULL)                       AS score_count
  FROM missions m
  WHERE m.assigned_to IS NOT NULL
  GROUP BY m.assigned_to
) sub
WHERE pp.user_id = sub.user_id
  AND pp.missions_completed = 0;   -- only backfill agents with no counter data
