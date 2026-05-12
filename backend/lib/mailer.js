'use strict'

// Transactional email via Resend (https://resend.com).
// Set RESEND_API_KEY in Railway Variables to activate.
// If the key is missing, emails are logged as JSON (no crash, no block).

const FROM_ADDRESS = process.env.RESEND_FROM || 'MyDD <noreply@mydd.work>'

const LEVEL_NAMES = {
  1: 'Level 1 — Document Verification',
  2: 'Level 2 — KYC Full Validation',
  3: 'Level 3 — Physical Site Inspection',
}

const sendViaResend = async (payload) => {
  // Lazy-require so the app starts even if `resend` is not installed yet.
  let Resend
  try {
    ;({ Resend } = require('resend'))
  } catch {
    console.warn('[mailer] resend package not found — run: npm install resend')
    return false
  }
  const client = new Resend(process.env.RESEND_API_KEY)
  const { error } = await client.emails.send(payload)
  if (error) {
    console.error('[mailer] Resend error:', error)
    return false
  }
  return true
}

/**
 * Send a payment confirmation email after a successful Stripe checkout.
 * Non-blocking — never throws, logs on failure.
 */
const sendPaymentConfirmation = async ({ email, amountCents, level, companyName }) => {
  if (!email) return

  const amountUsd = ((amountCents || 0) / 100).toFixed(2)
  const levelName = LEVEL_NAMES[level] || `Level ${level}`

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({
      event: 'payment.email.queued',
      mode: 'log_only',
      email,
      amountUsd,
      level,
      levelName,
    }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Your B&E Certification is confirmed — ${levelName}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Certification Confirmed</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        ${companyName ? `<strong style="color:#f5f5f5">${companyName}</strong> has been certified at ` : 'Your certification has been confirmed at '}
        <strong style="color:#b8972a">${levelName}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Certification level</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>${levelName}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa">Amount paid</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5"><strong>$${amountUsd} USD</strong></td>
        </tr>
      </table>
      <p style="color:#aaa;font-size:0.85rem;margin:0">
        Your certificate will appear in the B&amp;E Trusted Registry within 24 hours.<br>
        Questions? Reply to this email or contact <a href="mailto:support@mydd.work" style="color:#b8972a">support@mydd.work</a>.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'payment.email.sent', email, level }))
  } catch (err) {
    console.error('[mailer] sendPaymentConfirmation failed:', err.message)
  }
}

/**
 * Send a welcome email on first registration.
 * Non-blocking — never throws.
 */
const sendWelcome = async ({ email, name }) => {
  if (!email || !process.env.RESEND_API_KEY) return

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: 'Welcome to B&E Trusted Registry',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Welcome${name ? `, ${name}` : ''}!</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Your account is ready. Start by registering your company profile and select a certification plan.
      </p>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/dashboard"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        Go to Dashboard
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'welcome.email.sent', email }))
  } catch (err) {
    console.error('[mailer] sendWelcome failed:', err.message)
  }
}

/**
 * Send a password reset email with a time-limited link.
 * Non-blocking — never throws.
 */
const sendPasswordReset = async ({ email, name, resetUrl }) => {
  if (!email || !resetUrl) return

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'password_reset.email.queued', mode: 'log_only', email, resetUrl }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: 'Reset your MyDD password',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Reset your password</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Hi${name ? ` ${name}` : ''}, we received a request to reset your password.<br>
        Click the button below. This link is valid for <strong style="color:#f5f5f5">1 hour</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        Reset Password
      </a>
      <p style="color:#555;font-size:0.8rem;margin-top:24px;line-height:1.5">
        If you didn't request this, you can safely ignore this email.
        Your password won't change until you click the link above.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'password_reset.email.sent', email }))
  } catch (err) {
    console.error('[mailer] sendPasswordReset failed:', err.message)
  }
}

/**
 * Notify a PAC agent when they've successfully accepted a mission.
 */
const sendMissionAssigned = async ({ email, name, companyName, location, fee, missionId }) => {
  if (!email) return

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'mission.email.queued', mode: 'log_only', email, missionId }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Mission confirmed — ${companyName || 'Site Inspection'} #${missionId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry — PAC Portal</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Mission Assigned</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Hi${name ? ` ${name}` : ''},<br>
        You have been assigned a site inspection mission. Please coordinate with the company to schedule your visit.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Company</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>${companyName || '—'}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Location</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">${location || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa">Mission Fee</td>
          <td style="padding:8px 0;text-align:right;color:#b8972a"><strong>$${fee || 500} USD</strong></td>
        </tr>
      </table>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/pac"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        View in PAC Portal
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'mission.email.sent', email, missionId }))
  } catch (err) {
    console.error('[mailer] sendMissionAssigned failed:', err.message)
  }
}

/**
 * Notify company that a PAC site inspection has been completed.
 * Non-blocking — never throws.
 */
const sendMissionCompleted = async ({ email, name, companyName, outcome, missionId }) => {
  if (!email) return

  const outcomeLabel = { pass: '✅ PASS', fail: '❌ FAIL', conditional: '⚠️ CONDITIONAL' }[outcome] || outcome

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'mission_completed.email.queued', mode: 'log_only', email, missionId, outcome }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Site inspection report ready — ${companyName || 'Your company'} #${missionId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry — Site Inspection</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Inspection Report Submitted</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Hi${name ? ` ${name}` : ''},<br>
        Your PAC agent has submitted the site inspection report for <strong style="color:#f5f5f5">${companyName || 'your company'}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Mission #</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">#${missionId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa">Outcome</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:#b8972a">${outcomeLabel}</td>
        </tr>
      </table>
      <p style="color:#aaa;font-size:0.85rem;margin:0 0 24px">
        The B&amp;E team will review the report and update your certification status within 24 hours.
      </p>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/dashboard"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        View Dashboard
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'mission_completed.email.sent', email, missionId, outcome }))
  } catch (err) {
    console.error('[mailer] sendMissionCompleted failed:', err.message)
  }
}

/**
 * Send a 30-day certification renewal reminder.
 * Non-blocking — never throws.
 */
const sendRenewalReminder = async ({ email, name, companyName, level, expiresAt, renewUrl }) => {
  if (!email) return

  const levelName  = LEVEL_NAMES[level] || `Level ${level}`
  const expireDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'renewal_reminder.queued', mode: 'log_only', email, level, expiresAt }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Your B&E certification expires in 30 days — ${companyName || 'Renew now'}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Your certification expires soon</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        The <strong style="color:#b8972a">${levelName}</strong> certification for
        <strong style="color:#f5f5f5">${companyName || 'your company'}</strong>
        is set to expire on <strong style="color:#f5f5f5">${expireDate}</strong>.
        Renew now to maintain your verified status on the B&amp;E Trusted Registry.
      </p>
      <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;padding:14px 18px;margin-bottom:24px">
        <div style="font-size:0.75rem;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.1em">Expiry date</div>
        <div style="font-size:1.1rem;font-weight:700;color:#f39c12">${expireDate}</div>
      </div>
      <a href="${renewUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;margin-bottom:20px">
        Renew Certification →
      </a>
      <p style="color:#555;font-size:0.8rem;margin-top:16px;line-height:1.5">
        After expiry your company will be removed from the public B&amp;E Registry until renewed.<br>
        Questions? <a href="mailto:support@mydd.work" style="color:#b8972a">support@mydd.work</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'renewal_reminder.sent', email, level, expiresAt }))
  } catch (err) {
    console.error('[mailer] sendRenewalReminder failed:', err.message)
  }
}

/**
 * Send a one-time email verification link (24 h expiry).
 * Non-blocking — never throws.
 */
const sendEmailVerification = async ({ email, name, verifyUrl }) => {
  if (!email || !verifyUrl) return

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'email_verification.queued', mode: 'log_only', email, verifyUrl }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: 'Verify your B&E Registry email address',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Verify your email</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 28px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        Click the button below to confirm your email address. This link is valid for <strong style="color:#f5f5f5">24 hours</strong>.
      </p>
      <a href="${verifyUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;margin-bottom:24px">
        Verify Email Address
      </a>
      <p style="color:#555;font-size:0.8rem;margin-top:24px;line-height:1.5">
        If you didn't create this account, you can safely ignore this email.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'email_verification.sent', email }))
  } catch (err) {
    console.error('[mailer] sendEmailVerification failed:', err.message)
  }
}

/**
 * Notify a company owner when an admin grants / upgrades their certification level.
 * Non-blocking — never throws.
 */
const sendCertGranted = async ({ email, name, companyName, level, verifyUrl, grantedAt, certId }) => {
  if (!email) return

  const levelName = LEVEL_NAMES[level] || `Level ${level}`
  const baseUrl   = process.env.FRONTEND_URL || 'https://mydd.work'
  const badgeUrl  = `${baseUrl}/api/badge/${encodeURIComponent(companyName || 'company')}.svg`
  const embedSnippet = `&lt;img src="${badgeUrl}" alt="B&amp;E Certified" width="280" height="72"&gt;`

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({
      event: 'cert_granted.email.queued', mode: 'log_only', email, level, levelName,
    }))
    return
  }

  // Generate PDF certificate (best-effort — don't block email if PDF fails)
  let pdfAttachment = null
  try {
    const { generateCertPdf } = require('./certPdf')
    const pdfBuffer = await generateCertPdf({ companyName, level, grantedAt, verifyUrl, certId })
    pdfAttachment = {
      filename: `BE-Certificate-${(companyName || 'company').replace(/[^a-zA-Z0-9]/g, '-')}-L${level}.pdf`,
      content:  pdfBuffer.toString('base64'),
      type:     'application/pdf',
    }
  } catch (pdfErr) {
    console.error('[mailer] PDF generation failed (email sent without PDF):', pdfErr.message)
  }

  try {
    const payload = {
      from: FROM_ADDRESS,
      to: email,
      subject: `Certification granted — ${levelName} · ${companyName || 'Your company'}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 8px;color:#f5f5f5">Your Certification is Active</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Congratulations${name ? `, <strong style="color:#f5f5f5">${name}</strong>` : ''}!
        <strong style="color:#f5f5f5">${companyName || 'Your company'}</strong> is now certified at
        <strong style="color:#b8972a">${levelName}</strong> on the B&amp;E Trusted Registry.
      </p>

      ${verifyUrl ? `
      <a href="${verifyUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;margin-bottom:24px">
        View Certificate ↗
      </a>` : ''}

      <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 10px;font-size:0.8rem;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Embed your trust badge</p>
        <pre style="margin:0;font-size:0.72rem;color:#aaa;white-space:pre-wrap;word-break:break-all;font-family:monospace">${embedSnippet}</pre>
      </div>

      <p style="color:#aaa;font-size:0.85rem;margin:0;line-height:1.6">
        Your certificate and embeddable badge are now live${pdfAttachment ? ' — your PDF certificate is attached to this email' : ''}. Share the verify link with your trade partners to instantly prove your due-diligence status.<br><br>
        Questions? <a href="mailto:support@mydd.work" style="color:#b8972a">support@mydd.work</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    }
    if (pdfAttachment) payload.attachments = [pdfAttachment]
    await sendViaResend(payload)
    console.log(JSON.stringify({ event: 'cert_granted.email.sent', email, level, companyName, hasPdf: !!pdfAttachment }))
  } catch (err) {
    console.error('[mailer] sendCertGranted failed:', err.message)
  }
}

/**
 * Notify company that their certification has expired and been removed from the registry.
 * Non-blocking — never throws.
 */
const sendCertExpired = async ({ email, name, companyName, level, renewUrl }) => {
  if (!email) return

  const levelName = LEVEL_NAMES[level] || `Level ${level}`

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'cert_expired.email.queued', mode: 'log_only', email, level }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Your B&E certification has expired — ${companyName || 'Renew to stay listed'}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#c0392b;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#fff">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Certification Expired</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        The <strong style="color:#e74c3c">${levelName}</strong> certification for
        <strong style="color:#f5f5f5">${companyName || 'your company'}</strong>
        has expired. Your company has been removed from the B&amp;E Trusted Registry.
      </p>
      <div style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:6px;padding:14px 18px;margin-bottom:24px">
        <div style="font-size:0.75rem;color:#555;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em">Status</div>
        <div style="font-size:1rem;font-weight:700;color:#e74c3c">❌ Expired — Not listed in registry</div>
      </div>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px;font-size:0.9rem">
        Renew your certification to restore your verified status, reinstate your registry listing, and keep your trust badge active for buyers.
      </p>
      <a href="${renewUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;margin-bottom:20px">
        Renew Certification →
      </a>
      <p style="color:#555;font-size:0.8rem;margin-top:16px;line-height:1.5">
        Questions? <a href="mailto:support@mydd.work" style="color:#b8972a">support@mydd.work</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'cert_expired.email.sent', email, level, companyName }))
  } catch (err) {
    console.error('[mailer] sendCertExpired failed:', err.message)
  }
}

/**
 * Onboarding D+1: nudge users who registered but haven't set up a company profile yet.
 */
const sendOnboardingD1 = async ({ email, name, dashboardUrl }) => {
  if (!email || !process.env.RESEND_API_KEY) return
  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: 'One step away from being found by buyers — complete your profile',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Complete your company profile</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        You created your MyDD account yesterday — great first step. Buyers searching the B&amp;E Registry can't find you yet because your company profile isn't set up.
      </p>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px;font-size:0.9rem">
        It takes 2 minutes. Add your company name, sector, and country — and you'll be ready to start your certification.
      </p>
      <a href="${dashboardUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none">
        Complete Profile →
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'onboarding_d1.sent', email }))
  } catch (err) {
    console.error('[mailer] sendOnboardingD1 failed:', err.message)
  }
}

/**
 * Onboarding D+3: nudge companies with a profile but no certification yet.
 */
const sendOnboardingD3 = async ({ email, name, companyName, pricingUrl }) => {
  if (!email || !process.env.RESEND_API_KEY) return
  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Buyers are searching for certified suppliers like ${companyName || 'yours'} right now`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">B&amp;E Trusted Registry</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Get certified. Get found.</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        <strong style="color:#f5f5f5">${companyName || 'Your company'}</strong> has a profile on MyDD — but without a certification badge, you're invisible to buyers filtering the registry for verified suppliers.
      </p>
      <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:6px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-weight:700;color:#b8972a;font-size:0.9rem">What certified suppliers get:</p>
        <ul style="margin:0;padding-left:18px;color:#aaa;font-size:0.875rem;line-height:1.8">
          <li>Listed in the B&amp;E Trusted Registry (visible to global traders)</li>
          <li>Embeddable certification badge for your website</li>
          <li>Shareable verification link for trade negotiations</li>
          <li>Up to 3 certification levels — from document review to site inspection</li>
        </ul>
      </div>
      <a href="${pricingUrl}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none">
        View Certification Plans →
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'onboarding_d3.sent', email, companyName }))
  } catch (err) {
    console.error('[mailer] sendOnboardingD3 failed:', err.message)
  }
}

module.exports = { sendPaymentConfirmation, sendWelcome, sendPasswordReset, sendMissionAssigned, sendMissionCompleted, sendCertGranted, sendEmailVerification, sendRenewalReminder, sendCertExpired, sendOnboardingD1, sendOnboardingD3 }
