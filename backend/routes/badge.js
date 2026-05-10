'use strict'

/**
 * GET /api/badge/:id.svg  — returns a self-contained SVG certification badge.
 * GET /api/badge/:id      — same, for use without the .svg extension.
 *
 * Usage (embed on supplier website):
 *   <a href="https://mydd.work/verify/123">
 *     <img src="https://mydd.work/api/badge/123.svg" alt="MyDD Certified" height="72">
 *   </a>
 *
 * No auth required — public endpoint, rate-limited.
 */

const express = require('express')
const router  = express.Router()
const { query } = require('../db')
const rateLimit = require('express-rate-limit')

const badgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many badge requests',
})

const LEVEL = {
  1: { name: 'BRONZE', label: 'Document Verified', color: '#CD7F32', rgb: '205,127,50' },
  2: { name: 'SILVER', label: 'KYC Validated',     color: '#C0C0C0', rgb: '192,192,192' },
  3: { name: 'GOLD',   label: 'Site Inspected',    color: '#C9A84C', rgb: '201,168,76' },
}

// Escape XML special chars to prevent SVG injection from company names
const esc = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, 50)  // cap length so it fits the badge

const generateSVG = ({ companyName, level, certId, host }) => {
  const lv  = LEVEL[level] || null
  const color  = lv ? lv.color : '#555'
  const rgb    = lv ? lv.rgb  : '85,85,85'
  const lvName = lv ? `${lv.name} CERTIFIED · L${level}` : 'UNCERTIFIED'
  const lvDesc = lv ? lv.label : ''
  const verifyPath = certId ? `/verify/${certId}` : '/registry'
  const verifyFull = `${host}${verifyPath}`
  const name = esc(companyName)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="280" height="72" viewBox="0 0 280 72" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MyDD Certified — ${name}">
  <title>MyDD Certified: ${name}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111111"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${color}99"/>
    </linearGradient>
    <clipPath id="clip">
      <rect width="280" height="72" rx="8"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="280" height="72" rx="8" fill="url(#bg)"/>

  <!-- Left accent bar -->
  <rect width="4" height="72" fill="${color}"/>

  <!-- M logo box -->
  <rect x="14" y="18" width="30" height="30" rx="6" fill="url(#gold)"/>
  <text x="29" y="38" text-anchor="middle" fill="#111" font-size="14" font-weight="900"
    font-family="Arial,sans-serif">M</text>

  <!-- Company name -->
  <text x="55" y="30" fill="#ffffff" font-size="11" font-weight="700"
    font-family="Arial,sans-serif">${name}</text>

  <!-- Level label -->
  <text x="55" y="44" fill="${color}" font-size="8.5" font-weight="700" letter-spacing="0.8"
    font-family="Arial,sans-serif">${lvName}</text>

  <!-- Sub-label -->
  <text x="55" y="56" fill="#555555" font-size="8"
    font-family="Arial,sans-serif">${lvDesc}</text>

  <!-- Verify URL -->
  <text x="14" y="67" fill="#333333" font-size="7" font-family="Arial,sans-serif">${esc(verifyFull)}</text>

  <!-- Level pill (right side) -->
  ${lv ? `
  <rect x="228" y="22" width="38" height="22" rx="11"
    fill="rgba(${rgb},0.12)" stroke="${color}" stroke-width="0.8"/>
  <text x="247" y="37" text-anchor="middle" fill="${color}" font-size="10" font-weight="800"
    font-family="Arial,sans-serif">L${level}</text>
  ` : ''}
</svg>`
}

// ── Handlers (shared for :id and :id.svg) ────────────────────────────────────
const serveBadge = async (req, res) => {
  // Strip .svg suffix if present
  const rawId = req.params.id.replace(/\.svg$/i, '')
  const companyId = parseInt(rawId, 10)

  if (isNaN(companyId) || companyId <= 0) {
    return res.status(400).type('svg').send(generateSVG({ companyName: 'Invalid ID', level: 0, certId: null, host: '' }))
  }

  try {
    const result = await query(
      `SELECT c.id, c.company_name, c.name, c.certification_level
         FROM companies c
        WHERE c.id = $1 LIMIT 1`,
      [companyId],
    )

    const row = result.rows[0]
    if (!row) {
      return res.status(404).type('svg').send(
        generateSVG({ companyName: 'Company not found', level: 0, certId: null, host: '' }),
      )
    }

    const host = `${req.protocol}://${req.get('host')}`
    const svg = generateSVG({
      companyName: row.company_name || row.name || 'Unknown',
      level: row.certification_level || 0,
      certId: row.id,
      host,
    })

    // Cache for 1 hour — badge changes only when certification level changes
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(svg)
  } catch (err) {
    console.error(JSON.stringify({ event: 'badge_error', companyId, message: err.message }))
    res.status(500).type('svg').send(generateSVG({ companyName: 'Error', level: 0, certId: null, host: '' }))
  }
}

router.get('/:id.svg', badgeLimiter, serveBadge)
router.get('/:id',     badgeLimiter, serveBadge)

module.exports = router
