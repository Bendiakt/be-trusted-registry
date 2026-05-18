#!/usr/bin/env node
'use strict'
/**
 * scripts/verify-dns.js — Vérifie que tous les DNS mydd.work sont correctement configurés.
 * Usage : node scripts/verify-dns.js
 */

const dns = require('dns').promises

const DOMAIN     = 'mydd.work'
const API_DOMAIN = `api.${DOMAIN}`

const checks = [
  {
    name: `API CNAME (${API_DOMAIN} → Railway)`,
    fn: async () => {
      const records = await dns.resolveCname(API_DOMAIN)
      const ok = records.some(r => r.includes('railway.app') || r.includes('up.railway.app'))
      return { ok, value: records[0] || 'none' }
    },
  },
  {
    name: `Frontend CNAME (www.${DOMAIN} → Railway)`,
    fn: async () => {
      const records = await dns.resolveCname(`www.${DOMAIN}`)
      const ok = records.some(r => r.includes('railway.app'))
      return { ok, value: records[0] || 'none' }
    },
  },
  {
    name: `SPF (TXT ${DOMAIN})`,
    fn: async () => {
      const records = await dns.resolveTxt(DOMAIN)
      const spf = records.flat().find(r => r.startsWith('v=spf1'))
      const ok = !!spf && (spf.includes('amazonses.com') || spf.includes('resend.com') || spf.includes('include:'))
      return { ok, value: spf || 'NOT FOUND' }
    },
  },
  {
    name: `DKIM (TXT resend._domainkey.${DOMAIN})`,
    fn: async () => {
      const records = await dns.resolveTxt(`resend._domainkey.${DOMAIN}`)
      const dkim = records.flat().find(r => r.startsWith('p=') || r.startsWith('v=DKIM'))
      return { ok: !!dkim, value: dkim ? dkim.substring(0, 40) + '...' : 'NOT FOUND' }
    },
  },
  {
    name: `DMARC (TXT _dmarc.${DOMAIN})`,
    fn: async () => {
      const records = await dns.resolveTxt(`_dmarc.${DOMAIN}`)
      const dmarc = records.flat().find(r => r.startsWith('v=DMARC1'))
      return { ok: !!dmarc, value: dmarc || 'NOT FOUND' }
    },
  },
  {
    name: `MX records (${DOMAIN})`,
    fn: async () => {
      const records = await dns.resolveMx(DOMAIN)
      const ok = records.length > 0
      return { ok, value: ok ? records.map(r => r.exchange).join(', ') : 'NONE' }
    },
  },
  {
    name: `SPF unique (TXT ${DOMAIN})`,
    warn: true, // Namecheap injecte spf.efwd automatiquement via Email Forwarding — non supprimable
    fn: async () => {
      const records = await dns.resolveTxt(DOMAIN)
      const spfRecords = records.flat().filter(r => r.startsWith('v=spf1'))
      const hasSes = spfRecords.some(r => r.includes('amazonses.com'))
      const ok = spfRecords.length === 1
      const value = spfRecords.length === 0 ? 'NOT FOUND'
        : spfRecords.length > 1
          ? `${spfRecords.length} records (RFC recommande 1) — Resend SES: ${hasSes ? 'couvert' : 'manquant'}`
        : spfRecords[0]
      return { ok, value }
    },
  },
]

;(async () => {
  console.log(`\nDNS Verification — ${DOMAIN}\n` + '─'.repeat(50))

  let allOk = true
  for (const check of checks) {
    try {
      const { ok, value } = await check.fn()
      const icon = ok ? 'OK  ' : (check.warn ? 'WARN' : 'FAIL')
      console.log(`[${icon}] ${check.name}`)
      console.log(`       → ${value}`)
      if (!ok && !check.warn) allOk = false
    } catch (err) {
      const icon = check.warn ? 'WARN' : 'FAIL'
      console.log(`[${icon}] ${check.name}`)
      console.log(`       → ERROR: ${err.message}`)
      if (!check.warn) allOk = false
    }
  }

  console.log('\n' + '─'.repeat(50))
  if (allOk) {
    console.log('PASS: All DNS records correctly configured\n')
    process.exit(0)
  } else {
    console.log('FAIL: Some DNS records are missing or incorrect\n')
    process.exit(1)
  }
})()
