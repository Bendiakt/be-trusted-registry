'use strict'

const express    = require('express')
const rateLimit  = require('express-rate-limit')
const router     = express.Router()

const { query }                           = require('../db')
const { auth }                            = require('../lib/authUtils')
const { mapMissionRow }                   = require('../lib/mappers')
const { logAudit }                        = require('../lib/audit')
const { sendMissionAssigned,
        sendMissionCompleted }            = require('../lib/mailer')
const { createNotification }             = require('../lib/notify')
const { validate, schemas }              = require('../lib/validators')

// ── Rate limiters ────────────────────────────────────────────────────────────
// Read-heavy endpoints: list/get missions
const pacReadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `pac:read:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many requests. Please slow down.' },
})
// Write/action endpoints: accept, complete, save profile
const pacWriteLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `pac:write:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many write requests. Please slow down.' },
})

// ── GET /api/pac/missions ─────────────────────────────────────────────────────
router.get('/missions', auth, pacReadLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const result = await query(
      `SELECT * FROM missions
       WHERE status = 'available' OR assigned_to = $1
       ORDER BY CASE status WHEN 'assigned' THEN 0 WHEN 'available' THEN 1 ELSE 2 END, id DESC
       LIMIT 200`,
      [req.user.id],
    )
    res.json(result.rows.map(mapMissionRow))
  } catch (err) {
    console.error(JSON.stringify({ event: 'list_missions_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to load missions' })
  }
})

// ── GET /api/pac/missions/:id ─────────────────────────────────────────────────
router.get('/missions/:id', auth, pacReadLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result = await query(
      `SELECT m.*, u.name AS pac_agent_name, u.email AS pac_agent_email,
              pp.full_name AS pac_full_name, pp.location AS pac_location
         FROM missions m
         LEFT JOIN users u      ON u.id     = m.assigned_to
         LEFT JOIN pac_profiles pp ON pp.user_id = m.assigned_to
        WHERE m.id = $1 AND (m.status = 'available' OR m.assigned_to = $2)
        LIMIT 1`,
      [missionId, req.user.id],
    )
    const row = result.rows[0]
    if (!row) return res.status(404).json({ error: 'Mission not found' })
    res.json({
      ...mapMissionRow(row),
      pacAgentName:  row.pac_agent_name  || row.pac_full_name || null,
      pacAgentEmail: row.pac_agent_email || null,
      pacLocation:   row.pac_location    || null,
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'get_mission_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to load mission' })
  }
})

// ── GET /api/pac/missions/:id/pdf ─────────────────────────────────────────────
router.get('/missions/:id/pdf', auth, pacReadLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'pac' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const missionId = parseInt(req.params.id, 10)
    if (isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result = await query(
      `SELECT m.*, u.name AS pac_agent_name,
              pp.full_name AS pac_full_name, pp.location AS pac_location
         FROM missions m
         LEFT JOIN users u         ON u.id      = m.assigned_to
         LEFT JOIN pac_profiles pp ON pp.user_id = m.assigned_to
        WHERE m.id = $1
          AND ($2 = 'admin' OR m.assigned_to = $3 OR m.status = 'available')
        LIMIT 1`,
      [missionId, req.user.role, req.user.id],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Mission not found' })

    const row = result.rows[0]
    const m   = { ...mapMissionRow(row), pacAgentName: row.pac_agent_name || row.pac_full_name || null, pacLocation: row.pac_location || null }

    let PDFDocument
    try { PDFDocument = require('pdfkit') } catch {
      return res.status(503).json({ error: 'PDF generation unavailable — run npm install in backend' })
    }

    const OUTCOME_COLOR = { pass: '#27ae60', fail: '#e74c3c', conditional: '#f39c12' }
    const accentColor   = OUTCOME_COLOR[m.outcome] || '#555555'
    const now = new Date()

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
      Title:  `Mission Report #${String(m.id).padStart(6, '0')}`,
      Author: 'MyDD',
    }})

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="mission-report-${String(m.id).padStart(6, '0')}.pdf"`)
    doc.pipe(res)

    const W = 595.28
    const M = 48

    doc.rect(0, 0, W, 36).fill(accentColor)
    doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold')
       .text('MyDD — PAC AUDIT REPORT', M, 14, { align: 'center', width: W - M * 2, characterSpacing: 1.5 })

    let y = 52
    doc.roundedRect(M, y, 32, 32, 5).fill(accentColor)
    doc.fontSize(14).fillColor('#111111').font('Helvetica-Bold').text('M', M, y + 9, { width: 32, align: 'center' })
    doc.fontSize(13).fillColor('#111111').font('Helvetica-Bold').text('MyDD', M + 40, y + 4)
    doc.fontSize(7).fillColor('#999999').font('Helvetica').text('MY DUE DILIGENCE', M + 40, y + 20, { characterSpacing: 1 })

    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    doc.fontSize(8).fillColor('#aaaaaa').font('Helvetica').text('Report Date', 0, y + 4, { align: 'right', width: W - M })
    doc.fontSize(9).fillColor('#333333').font('Helvetica').text(dateStr, 0, y + 16, { align: 'right', width: W - M })

    y = 110
    doc.fontSize(7.5).fillColor('#aaaaaa').font('Helvetica').text('FIELD AUDIT REPORT', 0, y, { align: 'center', width: W, characterSpacing: 1.8 })
    y += 14
    doc.fontSize(20).fillColor('#111111').font('Helvetica-Bold').text(m.company_name || `Company #${m.company_id}`, 0, y, { align: 'center', width: W })
    y += 28
    if (m.location) {
      doc.fontSize(9).fillColor('#888888').font('Helvetica').text(m.location, 0, y, { align: 'center', width: W })
      y += 14
    }
    y += 8
    doc.rect(W / 2 - 28, y, 56, 2).fill(accentColor)
    y += 16

    if (m.outcome) {
      const OUTCOME_LABEL = { pass: 'PASS', fail: 'FAIL', conditional: 'CONDITIONAL' }
      const badgeW = m.outcome === 'conditional' ? 140 : 100
      const badgeX = (W - badgeW) / 2
      doc.roundedRect(badgeX, y, badgeW, 34, 6).fillAndStroke('#ffffff', accentColor)
      doc.fontSize(16).fillColor(accentColor).font('Helvetica-Bold')
         .text(OUTCOME_LABEL[m.outcome] || m.outcome.toUpperCase(), badgeX, y + 9, { align: 'center', width: badgeW })
      y += 52
    }

    const tableRows = [
      ['Mission ID',    `#${String(m.id).padStart(5, '0')}`],
      ['Type',          m.type ? m.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'],
      ['Status',        (m.status || '').toUpperCase()],
      ['Assigned Agent', m.pacAgentName || '—'],
      ['Completed On',  m.completedAt ? new Date(m.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'],
      ['Fee',           m.fee ? `$${m.fee} USD` : '—'],
    ]
    const colW = (W - M * 2) / 2
    doc.roundedRect(M, y, W - M * 2, tableRows.length * 22, 4).fill('#f9f9f9')
    tableRows.forEach(([label, val], i) => {
      const rowY = y + i * 22 + 6
      if (i > 0) doc.moveTo(M + 8, y + i * 22).lineTo(W - M - 8, y + i * 22).stroke('#eeeeee')
      doc.fontSize(8.5).fillColor('#999999').font('Helvetica').text(label, M + 10, rowY, { width: colW - 10 })
      doc.fontSize(8.5).fillColor('#333333').font('Helvetica-Bold').text(val, M + colW, rowY, { width: colW - 10, align: 'right' })
    })
    y += tableRows.length * 22 + 16

    if (m.description) {
      doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('MISSION SCOPE', M, y, { characterSpacing: 1.5 })
      y += 12
      doc.fontSize(9).fillColor('#444444').font('Helvetica').text(m.description, M, y, { width: W - M * 2, lineGap: 3 })
      y += doc.heightOfString(m.description, { width: W - M * 2, lineGap: 3 }) + 14
    }

    if (m.reportText) {
      doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('AUDIT FINDINGS', M, y, { characterSpacing: 1.5 })
      y += 12
      doc.fontSize(9).fillColor('#222222').font('Helvetica').text(m.reportText, M, y, { width: W - M * 2, lineGap: 3 })
      y += doc.heightOfString(m.reportText, { width: W - M * 2, lineGap: 3 }) + 20
    }

    doc.moveTo(M, y).lineTo(W - M, y).stroke('#eeeeee')
    y += 12
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('PAC AGENT', M, y, { characterSpacing: 1.2 })
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('ISSUED BY', W / 2, y, { align: 'right', width: W / 2 - M, characterSpacing: 1.2 })
    y += 12
    doc.fontSize(9).fillColor('#333333').font('Helvetica-Bold').text(m.pacAgentName || 'MyDD PAC Agent', M, y)
    doc.fontSize(9).fillColor('#333333').font('Helvetica-Bold').text('MyDD', W / 2, y, { align: 'right', width: W / 2 - M })
    if (m.pacLocation) {
      y += 13
      doc.fontSize(8).fillColor('#aaaaaa').font('Helvetica').text(m.pacLocation, M, y)
    }

    const pageH = 841.89
    doc.rect(0, pageH - 30, W, 30).fill('#111111')
    doc.fontSize(7).fillColor('#555555').font('Helvetica').text(`© ${now.getFullYear()} MyDD · mydd.work`, M, pageH - 19)
    doc.fontSize(7).fillColor('#444444').font('Helvetica').text(`REPORT-${String(m.id).padStart(6, '0')} · Confidential`, 0, pageH - 19, { align: 'right', width: W - M })
    doc.end()
  } catch (err) {
    console.error(JSON.stringify({ event: 'pdf_generation_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' })
  }
})

// ── GET /api/pac/profile ──────────────────────────────────────────────────────
router.get('/profile', auth, pacReadLimiter, async (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  try {
    const result = await query('SELECT * FROM pac_profiles WHERE user_id = $1 LIMIT 1', [req.user.id])
    const row    = result.rows[0] || null
    res.json(row ? {
      name:               row.full_name           || '',
      location:           row.location            || '',
      languages:          row.languages           || '',
      certifications:     row.certifications      || '',
      bio:                row.bio                 || '',
      pac_tier:           row.pac_tier            || 'S1',
      kyc_status:         row.kyc_status          || 'pending',
      membership_active:  row.membership_active   || false,
      membership_expires: row.membership_expires  || null,
      commission_rate:    row.commission_rate      || 0.10,
      max_supervised:     row.max_supervised       || 0,
      supervision_score:  row.supervision_score    || null,
    } : {})
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_profile_get_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

// ── POST /api/pac/profile ─────────────────────────────────────────────────────
router.post('/profile', auth, pacWriteLimiter, validate(schemas.updatePacProfile), async (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  try {
    const { name, location, languages, certifications, bio } = req.body
    const clean = (v, max) => (v ? String(v).trim().slice(0, max) || null : null)
    await query(
      `INSERT INTO pac_profiles (user_id, full_name, location, languages, certifications, bio, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name, location = EXCLUDED.location,
         languages = EXCLUDED.languages, certifications = EXCLUDED.certifications,
         bio = EXCLUDED.bio, updated_at = NOW()`,
      [
        req.user.id,
        clean(name, 150),
        clean(location, 150),
        clean(languages, 300),
        clean(certifications, 500),
        clean(bio, 3000),
      ],
    )
    res.json({ message: 'Profile saved' })
    logAudit(req.user.id, 'pac_profile_update', 'pac_profiles', req.ip, { name, location })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac_profile_save_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to save profile' })
  }
})

// ── POST /api/pac/missions/:id/accept ────────────────────────────────────────
router.post('/missions/:id/accept', auth, pacWriteLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (Number.isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result  = await query(
      `UPDATE missions SET assigned_to = $1, status = 'assigned'
       WHERE id = $2 AND status = 'available' RETURNING *`,
      [req.user.id, missionId],
    )
    const mission = mapMissionRow(result.rows[0])
    if (!mission) return res.status(404).json({ error: 'Mission not found or already assigned' })

    res.json({ message: 'Mission accepted', mission })
    logAudit(req.user.id, 'mission_accepted', 'missions', req.ip, { missionId })

    const pacUser = await query('SELECT name, email FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    const pac     = pacUser.rows[0] || {}
    sendMissionAssigned({ email: pac.email, name: pac.name, companyName: mission.company_name, location: mission.location, fee: mission.fee, missionId: mission.id }).catch(() => {})
    // Persist in-app notification for the PAC agent
    createNotification(req.user.id, {
      type:  'mission_assigned',
      title: `Mission #${mission.id} assigned to you`,
      body:  `${mission.company_name} — ${mission.location || 'Location TBD'}`,
      link:  '/pac',
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'accept_mission_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to accept mission' })
  }
})

// ── POST /api/pac/missions/:id/complete ──────────────────────────────────────
router.post('/missions/:id/complete', auth, pacWriteLimiter, validate(schemas.submitMissionReport), async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (Number.isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const { report_text, outcome } = req.body
    const VALID_OUTCOMES = ['pass', 'fail', 'conditional']
    if (!report_text || !outcome || !VALID_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: 'report_text and outcome (pass|fail|conditional) are required' })
    }
    const cleanReport = String(report_text).trim().slice(0, 20_000)
    if (cleanReport.length < 10) {
      return res.status(400).json({ error: 'Report text is too short (min 10 characters)' })
    }

    const result  = await query(
      `UPDATE missions SET status = 'completed', report_text = $1, outcome = $2, completed_at = NOW()
       WHERE id = $3 AND assigned_to = $4 AND status = 'assigned' RETURNING *`,
      [cleanReport, outcome, missionId, req.user.id],
    )
    const mission = mapMissionRow(result.rows[0])
    if (!mission) return res.status(404).json({ error: 'Mission not found or not assigned to you' })

    res.json({ message: 'Mission completed', mission })
    logAudit(req.user.id, 'mission_completed', 'missions', req.ip, { missionId, outcome })

    const companyUserQ = await query(
      `SELECT u.id, u.name, u.email FROM users u JOIN companies c ON c.user_id = u.id WHERE c.id = $1 LIMIT 1`,
      [mission.company_id],
    )
    const companyUser = companyUserQ.rows[0] || {}
    sendMissionCompleted({ email: companyUser.email, name: companyUser.name, companyName: mission.company_name, outcome, missionId: mission.id }).catch(() => {})
    // Persist in-app notification for the company
    if (companyUser.id) {
      createNotification(companyUser.id, {
        type:  'mission_completed',
        title: `Mission #${mission.id} completed — ${outcome}`,
        body:  `Your audit mission has been completed with outcome: ${outcome}.`,
        link:  '/dashboard?tab=missions',
      })
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'complete_mission_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to complete mission' })
  }
})

// ── GET /api/pac/progress — achievement progress for the logged-in agent ──────
// Returns current stats vs. the next-tier thresholds so the frontend
// can render the progress bars without computing anything.
router.get('/progress', auth, pacReadLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'PAC agents only' })

    const { rows } = await query(`
      SELECT
        pp.pac_tier, pp.eligible_for_s2, pp.eligible_for_s3,
        pp.missions_completed, pp.missions_on_time,
        pp.l2_missions_completed, pp.supervised_s1_completed,
        pp.double_rejections, pp.months_as_s2,
        pp.admin_score_total, pp.admin_score_count,
        pp.client_score_total, pp.client_score_count,
        pp.promotion_date_s2, pp.promotion_date_s3,
        pp.tier_anniversary, pp.membership_active,
        GREATEST(0, EXTRACT(MONTH FROM AGE(NOW(), u.created_at))::int) AS months_active
      FROM pac_profiles pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.user_id = $1
      LIMIT 1
    `, [req.user.id])

    if (!rows.length) return res.status(404).json({ error: 'PAC profile not found' })
    const p = rows[0]

    const adminAvg  = p.admin_score_count  > 0 ? +(p.admin_score_total  / p.admin_score_count ).toFixed(2) : 0
    const clientAvg = p.client_score_count > 0 ? +(p.client_score_total / p.client_score_count).toFixed(2) : 0
    const onTimeRate = p.missions_completed > 0 ? +(p.missions_on_time / p.missions_completed).toFixed(2) : 0
    const tier = (p.pac_tier || 'S1').toUpperCase()

    // Build per-criterion progress for the relevant upgrade path
    let criteria = null
    let targetTier = null

    if (tier === 'S1') {
      targetTier = 'S2'
      criteria = [
        { key: 'missions',          label: 'Missions completed', value: p.missions_completed, target: 10,   met: p.missions_completed >= 10 },
        { key: 'admin_score',       label: 'Admin score',        value: adminAvg,              target: 4.0,  met: adminAvg >= 4.0 },
        { key: 'on_time_rate',      label: 'On-time rate',       value: onTimeRate,            target: 0.85, met: onTimeRate >= 0.85, format: 'percent' },
        { key: 'double_rejections', label: 'Zero double rejections', value: p.double_rejections, target: 0, met: p.double_rejections === 0, inverse: true },
        { key: 'seniority',         label: 'Platform seniority', value: p.months_active,       target: 6,   met: p.months_active >= 6, format: 'months' },
      ]
    } else if (tier === 'S2') {
      targetTier = 'S3'
      criteria = [
        { key: 'missions',             label: 'Total missions',      value: p.missions_completed,      target: 25,  met: p.missions_completed >= 25 },
        { key: 'l2_missions',          label: 'L2 missions',         value: p.l2_missions_completed,   target: 10,  met: p.l2_missions_completed >= 10 },
        { key: 'admin_score',          label: 'Admin score',         value: adminAvg,                  target: 4.5, met: adminAvg >= 4.5 },
        { key: 'client_score',         label: 'Client score',        value: clientAvg,                 target: 4.3, met: clientAvg >= 4.3 },
        { key: 'on_time_rate',         label: 'On-time rate',        value: onTimeRate,                target: 0.90, met: onTimeRate >= 0.90, format: 'percent' },
        { key: 'supervised_s1',        label: 'S1 agents supervised', value: p.supervised_s1_completed, target: 3,   met: p.supervised_s1_completed >= 3 },
        { key: 'no_disputes',          label: 'Zero disputes',       value: p.double_rejections,       target: 0,   met: p.double_rejections === 0, inverse: true },
        { key: 'months_as_s2',         label: 'Months as S2',        value: p.months_as_s2,            target: 12,  met: p.months_as_s2 >= 12, format: 'months' },
      ]
    }

    const metCount   = criteria ? criteria.filter(c => c.met).length : 0
    const totalCount = criteria ? criteria.length : 0
    const pct = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 100

    res.json({
      current_tier:    tier,
      target_tier:     targetTier,
      eligible_for_s2: p.eligible_for_s2,
      eligible_for_s3: p.eligible_for_s3,
      progress_pct:    pct,
      criteria,
      tier_anniversary: p.tier_anniversary,
      membership_active: p.membership_active,
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac.progress.error', message: err.message }))
    res.status(500).json({ error: 'Failed to load progress' })
  }
})

module.exports = router
