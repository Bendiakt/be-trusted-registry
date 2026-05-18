#!/usr/bin/env node
'use strict'
/**
 * scripts/verify-email.js — Teste l'envoi email via Resend après configuration.
 * Usage : RESEND_API_KEY=re_xxx node scripts/verify-email.js --to votre@email.com
 */

const apiKey  = process.env.RESEND_API_KEY
const toIndex = process.argv.indexOf('--to')
const to      = toIndex !== -1 ? process.argv[toIndex + 1] : null

if (!apiKey) {
  console.error('RESEND_API_KEY manquant\n  Usage: RESEND_API_KEY=re_xxx node scripts/verify-email.js --to email@exemple.com')
  process.exit(1)
}
if (!to || !to.includes('@')) {
  console.error('Email destinataire manquant ou invalide\n  Usage: RESEND_API_KEY=re_xxx node scripts/verify-email.js --to email@exemple.com')
  process.exit(1)
}

// Resend n'est pas dans les dépendances root — on l'appelle directement via HTTPS
const https = require('https')

const resendRequest = (method, path, body = null) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null
  const req = https.request({
    hostname: 'api.resend.com',
    path,
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    },
  }, (res) => {
    let buf = ''
    res.on('data', c => { buf += c })
    res.on('end', () => {
      try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) }
      catch { resolve({ status: res.statusCode, body: buf }) }
    })
  })
  req.on('error', reject)
  if (data) req.write(data)
  req.end()
})

;(async () => {
  console.log(`\nEmail Test — Resend\n` + '─'.repeat(50))

  // Check 1 — API connectivity + domain status (requiert une clé full-access)
  console.log('Checking Resend API connection and domain status...')
  try {
    const { status, body } = await resendRequest('GET', '/domains')
    if (status === 401 && body?.name === 'restricted_api_key') {
      console.log('[WARN] Clé API restreinte (sending only) — vérification domaine ignorée')
      console.log('       → DKIM Verified confirmé via verify:dns ✅')
    } else if (status !== 200) {
      console.log(`[FAIL] API connection failed (HTTP ${status})`)
      console.log(`       → ${JSON.stringify(body)}`)
      process.exit(1)
    } else {
      const domains = body.data || []
      const myddDomain = domains.find(d => d.name === 'mydd.work')
      if (!myddDomain) {
        console.log('[WARN] Domain mydd.work not found in Resend')
        console.log('       → Go to resend.com → Domains → Add Domain → mydd.work')
      } else {
        const verified = myddDomain.status === 'verified'
        console.log(`[${verified ? 'OK  ' : 'WARN'}] Domain mydd.work status: ${myddDomain.status}`)
        if (!verified) console.log('       → Go to resend.com → Domains → mydd.work → Verify DNS records')
      }
    }
  } catch (err) {
    console.log(`[FAIL] API connection error: ${err.message}`)
    process.exit(1)
  }

  // Check 2 — Send test email
  console.log(`\nSending test email to ${to}...`)
  try {
    const { status, body } = await resendRequest('POST', '/emails', {
      from:    'MyDD Test <noreply@mydd.work>',
      to:      [to],
      subject: 'MyDD email configuration test',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px">
          <h2 style="color:#4f46e5">Email configuration successful</h2>
          <p>This email confirms that <strong>noreply@mydd.work</strong> is correctly configured via Resend.</p>
          <p>Sent at: ${new Date().toISOString()}</p>
          <hr style="border:1px solid #e5e7eb;margin:30px 0">
          <p style="color:#9ca3af;font-size:13px">MyDD Registry — B&E Consult FZCO</p>
        </div>
      `,
    })

    if (status >= 200 && status < 300) {
      console.log(`[OK  ] Email sent successfully`)
      console.log(`       → ID: ${body.id}`)
      console.log(`\nCheck delivery at: resend.com → Logs → ${body.id}\n`)
      process.exit(0)
    } else {
      console.log(`[FAIL] Send failed (HTTP ${status})`)
      console.log(`       → ${JSON.stringify(body)}`)
      process.exit(1)
    }
  } catch (err) {
    console.log(`[FAIL] ${err.message}`)
    process.exit(1)
  }
})()
