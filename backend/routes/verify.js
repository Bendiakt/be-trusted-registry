'use strict'
/**
 * routes/verify.js — Public company verification endpoint
 *
 * GET /api/verify/:id  — returns full company profile + live cert info.
 * Mounted in server.js at /api/verify (no auth required).
 *
 * B2B access: supply X-API-Key: mydd_... header with scope "verify:read"
 * to authenticate, meter usage, and receive a higher rate limit (300 req/min).
 */

const express = require('express')
const { publicReadLimiter, apiKeyReadLimiter } = require('../lib/auth')
const { apiKeyAuth } = require('../lib/apiKeyAuth')
const { query }      = require('../db')
const { mapCompanyRow } = require('../lib/mappers')

const router = express.Router()

const optionalApiKey = apiKeyAuth('verify:read')
const smartLimiter   = (req, res, next) =>
  req.apiKey ? apiKeyReadLimiter(req, res, next) : publicReadLimiter(req, res, next)

// GET /api/verify/:id
router.get('/:id', optionalApiKey, smartLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const result  = await query('SELECT * FROM companies WHERE id = $1 LIMIT 1', [companyId])
    const company = mapCompanyRow(result.rows[0])
    if (!company) return res.status(404).json({ error: 'Company not found' })

    // Attach certInfo (expiry, days left) — mirrors logic in /api/companies/me
    let certInfo = null
    const certResult = await query(
      `SELECT level, status, granted_at, expires_at
         FROM certifications
        WHERE company_id = $1 AND status IN ('active', 'submitted')
        ORDER BY level DESC, id DESC LIMIT 1`,
      [companyId]
    )
    if (certResult.rows.length > 0) {
      const c        = certResult.rows[0]
      const expiresAt = c.expires_at ? new Date(c.expires_at) : null
      const daysLeft  = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null
      certInfo = {
        level:        c.level,
        status:       c.status,
        grantedAt:    c.granted_at,
        expiresAt:    c.expires_at,
        daysLeft,
        expiringSoon: daysLeft !== null && daysLeft <= 60,
        expired:      daysLeft !== null && daysLeft <= 0,
      }
    }

    res.json({ ...company, certInfo })
  } catch (err) {
    console.error(JSON.stringify({ event: 'verify.error', companyId: req.params.id, err: err.message }))
    res.status(500).json({ error: 'Verification failed' })
  }
})

// ── GET /api/verify/:id/pdf ───────────────────────────────────────────────────
// Server-side certificate PDF (pdfkit). Public — no auth required.
router.get('/:id/pdf', optionalApiKey, smartLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const result  = await query('SELECT * FROM companies WHERE id = $1 LIMIT 1', [companyId])
    const company = mapCompanyRow(result.rows[0])
    if (!company) return res.status(404).json({ error: 'Company not found' })

    // Certification info
    let certInfo = null
    const certResult = await query(
      `SELECT level, status, granted_at, expires_at
         FROM certifications
        WHERE company_id = $1 AND status IN ('active', 'submitted')
        ORDER BY level DESC, id DESC LIMIT 1`,
      [companyId],
    )
    if (certResult.rows.length > 0) {
      const c        = certResult.rows[0]
      const expiresAt = c.expires_at ? new Date(c.expires_at) : null
      const daysLeft  = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null
      certInfo = { level: c.level, status: c.status, grantedAt: c.granted_at, expiresAt: c.expires_at, daysLeft, expired: daysLeft !== null && daysLeft <= 0 }
    }

    let PDFDocument
    try { PDFDocument = require('pdfkit') } catch {
      return res.status(503).json({ error: 'PDF generation unavailable' })
    }

    const LEVEL_CONFIG = {
      1: { name: 'BRONZE', label: 'Level 1 — Document Verified', color: '#CD7F32' },
      2: { name: 'SILVER', label: 'Level 2 — KYC Validated',     color: '#A0A0A0' },
      3: { name: 'GOLD',   label: 'Level 3 — Site Inspected',    color: '#C9A84C' },
    }

    const lvl    = certInfo?.level || company.certificationLevel || 0
    const cfg    = LEVEL_CONFIG[lvl]
    const accent = cfg?.color || '#888888'
    const now    = new Date()

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
      Title:  `MyDD Certificate — ${company.companyName || `Company #${companyId}`}`,
      Author: 'MyDD by B&E Consult FZCO',
    }})

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${String(companyId).padStart(6, '0')}.pdf"`)
    doc.pipe(res)

    const W  = 595.28   // A4 width pts
    const H  = 841.89   // A4 height pts
    const M  = 56       // horizontal margin

    // ── Top colour bar ────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 10).fill(accent)

    // ── Letterhead ────────────────────────────────────────────────────────────
    let y = 38
    // Logo box
    doc.roundedRect(M, y, 34, 34, 6).fill(accent)
    doc.fontSize(14).fillColor('#ffffff').font('Helvetica-Bold').text('M', M, y + 10, { width: 34, align: 'center' })
    // Brand name
    doc.fontSize(14).fillColor('#111111').font('Helvetica-Bold').text('MyDD', M + 44, y + 5)
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('MY DUE DILIGENCE · B&E Consult FZCO', M + 44, y + 22, { characterSpacing: 0.8 })
    // Date (right-aligned)
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    doc.fontSize(7.5).fillColor('#aaaaaa').font('Helvetica').text('Generated', 0, y + 5, { align: 'right', width: W - M })
    doc.fontSize(8.5).fillColor('#333333').font('Helvetica').text(dateStr, 0, y + 16, { align: 'right', width: W - M })

    // ── Divider ───────────────────────────────────────────────────────────────
    y = 96
    doc.moveTo(M, y).lineTo(W - M, y).stroke('#e8e8e8')
    y += 24

    // ── Certificate heading ───────────────────────────────────────────────────
    doc.fontSize(8).fillColor('#bbbbbb').font('Helvetica').text('CERTIFICATE OF CERTIFICATION', 0, y, { align: 'center', width: W, characterSpacing: 2.5 })
    y += 16
    doc.fontSize(8).fillColor('#cccccc').font('Helvetica').text('This is to certify that', 0, y, { align: 'center', width: W })
    y += 28

    // ── Company name ──────────────────────────────────────────────────────────
    const compName = company.companyName || company.name || `Company #${companyId}`
    doc.fontSize(26).fillColor('#111111').font('Helvetica-Bold').text(compName, 0, y, { align: 'center', width: W })
    y += 36
    const meta = [company.country, company.sector].filter(Boolean).join(' · ')
    if (meta) {
      doc.fontSize(10).fillColor('#888888').font('Helvetica').text(meta, 0, y, { align: 'center', width: W })
      y += 20
    }

    // ── Gold divider rule ─────────────────────────────────────────────────────
    y += 8
    doc.rect((W - 60) / 2, y, 60, 2).fill(accent)
    y += 20

    // ── Certification badge ───────────────────────────────────────────────────
    if (cfg) {
      const bw = 250; const bh = 72; const bx = (W - bw) / 2
      doc.roundedRect(bx, y, bw, bh, 8)
         .fillAndStroke('#fafafa', `${accent}44`)
      doc.fontSize(9).fillColor(accent).font('Helvetica-Bold')
         .text(`${cfg.name} CERTIFIED`, bx, y + 14, { align: 'center', width: bw, characterSpacing: 1.5 })
      doc.fontSize(10).fillColor('#444444').font('Helvetica')
         .text(cfg.label, bx, y + 32, { align: 'center', width: bw })
      y += bh + 24
    } else {
      doc.fontSize(10).fillColor('#aaaaaa').font('Helvetica').text('Not certified', 0, y, { align: 'center', width: W })
      y += 40
    }

    // ── Dates table ───────────────────────────────────────────────────────────
    const dateRows = []
    if (certInfo?.grantedAt)  dateRows.push(['Issued',      new Date(certInfo.grantedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })])
    if (certInfo?.expiresAt)  dateRows.push(['Valid Until', new Date(certInfo.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) + (certInfo.expired ? ' (EXPIRED)' : '')])
    if (company.verifiedAt && !certInfo?.grantedAt)
      dateRows.push(['Issued', new Date(company.verifiedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })])

    if (dateRows.length) {
      const colW = 120; const startX = (W - dateRows.length * colW) / 2
      dateRows.forEach(([lbl, val], i) => {
        const cx = startX + i * colW
        doc.fontSize(7.5).fillColor('#aaaaaa').font('Helvetica').text(lbl.toUpperCase(), cx, y, { width: colW, align: 'center', characterSpacing: 1 })
        doc.fontSize(9.5).fillColor(i === 1 && certInfo?.expired ? '#e74c3c' : '#333333').font('Helvetica-Bold').text(val, cx, y + 14, { width: colW, align: 'center' })
      })
      y += 52
    }

    // ── Verification section ──────────────────────────────────────────────────
    const verifyUrl = `https://mydd.work/verify/${companyId}`
    const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verifyUrl)}&color=111111&bgcolor=f7f7f7&margin=4`
    const boxW = W - M * 2; const boxH = 72; const boxX = M
    doc.roundedRect(boxX, y, boxW, boxH, 6).fill('#f7f7f7')
    // QR code: embed if available (best-effort; graceful skip if network unavailable at build)
    try {
      const https = require('https')
      await new Promise((resolve) => {
        https.get(qrUrl, (imgRes) => {
          const chunks = []
          imgRes.on('data', c => chunks.push(c))
          imgRes.on('end', () => {
            try {
              doc.image(Buffer.concat(chunks), boxX + 8, y + 8, { width: 56, height: 56 })
            } catch { /* skip QR if image decode fails */ }
            resolve()
          })
          imgRes.on('error', resolve)
        }).on('error', resolve)
      })
    } catch { /* skip QR silently */ }
    // Verify text
    doc.fontSize(7.5).fillColor('#aaaaaa').font('Helvetica').text('VERIFY ONLINE', boxX + 80, y + 14, { characterSpacing: 1.2 })
    doc.fontSize(8).fillColor('#555555').font('Helvetica').text(verifyUrl, boxX + 80, y + 28, { width: boxW - 88 })
    y += boxH + 16

    // ── Cert ID ───────────────────────────────────────────────────────────────
    doc.fontSize(7.5).fillColor('#cccccc').font('Helvetica')
       .text(`CERT-${String(companyId).padStart(6, '0')}`, 0, y, { align: 'center', width: W, characterSpacing: 1 })

    // ── Bottom bar ────────────────────────────────────────────────────────────
    doc.rect(0, H - 30, W, 30).fill('#111111')
    doc.fontSize(7).fillColor('#555555').font('Helvetica').text(`© ${now.getFullYear()} B&E Consult FZCO · Dubai Silicon Oasis, UAE`, M, H - 18)
    doc.fontSize(7).fillColor('#444444').font('Helvetica').text('mydd.work', 0, H - 18, { align: 'right', width: W - M })

    doc.end()
  } catch (err) {
    console.error(JSON.stringify({ event: 'cert_pdf.error', companyId: req.params.id, err: err.message }))
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' })
  }
})

module.exports = router
