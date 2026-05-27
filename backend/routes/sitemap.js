'use strict'
/**
 * routes/sitemap.js — SEO endpoints
 *
 * GET /sitemap.xml — dynamic XML sitemap including all certified company pages.
 * GET /robots.txt  — robots crawl policy.
 *
 * Mounted in server.js at / (root, no auth).
 */

const express = require('express')
const { query } = require('../db')

const router = express.Router()

const FRONTEND = () => process.env.FRONTEND_URL || 'https://mydd.work'

// GET /sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  const base   = FRONTEND()
  const STATIC = ['', '/registry', '/login', '/register']
  try {
    const result = await query(
      'SELECT id, updated_at FROM companies WHERE certification_level > 0 ORDER BY id ASC'
    )
    const urls = [
      ...STATIC.map(p => ({ loc: `${base}${p}`, changefreq: 'weekly', priority: p === '' ? '1.0' : '0.8' })),
      ...result.rows.map(r => ({
        loc:        `${base}/verify/${r.id}`,
        lastmod:    r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
        changefreq: 'monthly',
        priority:   '0.9',
      })),
    ]
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(u => [
        '  <url>',
        `    <loc>${u.loc}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        '  </url>',
      ].filter(Boolean).join('\n')),
      '</urlset>',
    ].join('\n')
    res.set('Content-Type', 'application/xml; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  } catch (err) {
    console.error(JSON.stringify({ event: 'sitemap.error', err: err.message }))
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')
  }
})

// GET /robots.txt
router.get('/robots.txt', (req, res) => {
  const base = FRONTEND()
  res.set('Content-Type', 'text/plain')
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`)
})

// GET /.well-known/security.txt — RFC 9116 vulnerability disclosure policy
// SOC 2 CC7.3 — Provides a standardised contact channel for security researchers.
router.get('/.well-known/security.txt', (req, res) => {
  const base = FRONTEND()
  // Expires 1 year from the last known deploy date; update annually.
  const expires = new Date('2027-06-01T00:00:00.000Z').toISOString()
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.set('Cache-Control', 'public, max-age=86400')
  res.send([
    `Contact: mailto:security@b-econsult.com`,
    `Expires: ${expires}`,
    `Preferred-Languages: en, fr`,
    `Policy: ${base}/legal`,
    `Canonical: https://api.mydd.work/.well-known/security.txt`,
    `Hiring: https://mydd.work`,
    '',
  ].join('\n'))
})

module.exports = router
