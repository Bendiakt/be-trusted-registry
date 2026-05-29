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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
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
        Your certificate will appear in the MyDD within 24 hours.<br>
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
      subject: 'Welcome to MyDD',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD — PAC Portal</p>
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD — Site Inspection</p>
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Your certification expires soon</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        The <strong style="color:#b8972a">${levelName}</strong> certification for
        <strong style="color:#f5f5f5">${companyName || 'your company'}</strong>
        is set to expire on <strong style="color:#f5f5f5">${expireDate}</strong>.
        Renew now to maintain your verified status on the MyDD.
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
        After expiry your company will be removed from the public MyDD until renewed.<br>
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
      subject: 'Verify your MyDD email address',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 8px;color:#f5f5f5">Your Certification is Active</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Congratulations${name ? `, <strong style="color:#f5f5f5">${name}</strong>` : ''}!
        <strong style="color:#f5f5f5">${companyName || 'Your company'}</strong> is now certified at
        <strong style="color:#b8972a">${levelName}</strong> on the MyDD.
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#fff">MyDD</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Certification Expired</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        The <strong style="color:#e74c3c">${levelName}</strong> certification for
        <strong style="color:#f5f5f5">${companyName || 'your company'}</strong>
        has expired. Your company has been removed from the MyDD.
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 12px;color:#f5f5f5">Complete your company profile</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 20px">
        Hi${name ? ` <strong style="color:#f5f5f5">${name}</strong>` : ''},<br>
        You created your MyDD account yesterday — great first step. Buyers searching the MyDD can't find you yet because your company profile isn't set up.
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
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD</p>
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
          <li>Listed in the MyDD (visible to global traders)</li>
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

// ── PAC v3 — Supervision task reminder ───────────────────────────────────────
const sendSupervisionTaskReminder = async ({ email, name, tier, pendingTasks, completionPct, bonusStatus, portalUrl }) => {
  if (!email) return
  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'pac.supervision.reminder.queued', mode: 'log_only', email }))
    return
  }

  const statusColor = bonusStatus === 'full' ? '#2ecc71' : bonusStatus === 'half' ? '#f39c12' : '#ff6b6b'
  const statusLabel = bonusStatus === 'full' ? '✅ Full bonus on track' : bonusStatus === 'half' ? '⚠️ 50% bonus — needs improvement' : '❌ Bonus suspended this month'
  const taskList = (pendingTasks || []).map(t => `<li style="margin-bottom:6px;color:#ccc">${t}</li>`).join('')

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `[MyDD ${tier}] Weekly supervision reminder — ${completionPct}% tasks completed`,
      html: `
<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD — PAC ${tier} Supervision</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.3rem;margin:0 0 8px;color:#f5f5f5">Weekly Supervision Reminder</h1>
      <p style="color:#aaa;margin:0 0 24px">Hi${name ? ` ${name}` : ''},</p>

      <div style="background:#1a1a1a;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:0.9rem;color:#aaa">This month's completion</p>
        <div style="height:8px;background:#222;border-radius:4px;overflow:hidden;margin-bottom:8px">
          <div style="height:100%;width:${Math.min(completionPct,100)}%;background:${statusColor};border-radius:4px"></div>
        </div>
        <p style="margin:0;font-weight:700;color:${statusColor}">${completionPct}% — ${statusLabel}</p>
      </div>

      ${taskList ? `
      <p style="font-weight:600;color:#f5f5f5;margin:0 0 8px">Pending tasks this week:</p>
      <ul style="padding-left:20px;margin:0 0 24px">${taskList}</ul>
      ` : `<p style="color:#2ecc71;margin:0 0 24px">✅ All tasks completed this week — great work!</p>`}

      <a href="${portalUrl || (process.env.FRONTEND_URL || 'https://mydd.work') + '/pac'}"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        Go to Supervision Dashboard
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      Bonus paid M+1 after admin validation. Requires ≥80% task completion for full bonus.<br>
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.supervision.reminder.sent', email, tier, completionPct }))
  } catch (err) {
    console.error('[mailer] sendSupervisionTaskReminder failed:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAC membership confirmation (sent on first payment)
// ─────────────────────────────────────────────────────────────────────────────
const PAC_TIER_DISPLAY = { S2: 'PAC Certified (S2)', S3: 'PAC Senior (S3)' }
const PAC_TIER_PRICE   = { S2: '399', S3: '799' }

const sendPacMembershipConfirmation = async ({ email, agentName, tier, membershipExpires }) => {
  if (!email) return
  const tierName   = PAC_TIER_DISPLAY[tier]  || tier
  const tierPrice  = PAC_TIER_PRICE[tier]    || '?'
  const expiresStr = membershipExpires
    ? new Date(membershipExpires).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Annual'
  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'pac.membership.email.queued', mode: 'log_only', email, tier }))
    return
  }
  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Your MyDD PAC ${tier} Membership is confirmed`,
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD PAC Network</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 8px;color:#f5f5f5">Membership Payment Confirmed</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">Hello ${agentName ? `<strong style="color:#f5f5f5">${agentName}</strong>` : 'there'}, your <strong style="color:#C9A84C">${tierName}</strong> annual membership has been received. Your application is now under KYC review — you will be notified once approved.</p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr><td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Membership</td><td style="padding:8px 0;text-align:right;color:#C9A84C;border-bottom:1px solid #222"><strong>${tierName}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Annual fee</td><td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>$${tierPrice} USD</strong></td></tr>
        <tr><td style="padding:8px 0;color:#aaa">Valid until</td><td style="padding:8px 0;text-align:right;color:#f5f5f5"><strong>${expiresStr}</strong></td></tr>
      </table>
      <p style="color:#aaa;font-size:0.85rem;margin:0">Questions? <a href="mailto:support@mydd.work" style="color:#C9A84C">support@mydd.work</a></p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.membership.email.sent', email, tier }))
  } catch (err) {
    console.error('[mailer] sendPacMembershipConfirmation failed:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAC KYC decision (sent when admin approves or rejects)
// ─────────────────────────────────────────────────────────────────────────────
const sendPacKycDecision = async ({ email, agentName, kyc_status, pac_tier, notes }) => {
  if (!email) return
  const approved  = kyc_status === 'approved'
  const tierName  = PAC_TIER_DISPLAY[pac_tier] || pac_tier || ''
  const subject   = approved
    ? `✅ Your MyDD PAC ${pac_tier} application is approved`
    : `Your MyDD PAC application status: ${kyc_status}`
  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'pac.kyc.email.queued', mode: 'log_only', email, kyc_status, pac_tier }))
    return
  }
  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject,
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:${approved ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1a1a1a'};padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:${approved ? '#000' : '#C9A84C'}">MyDD PAC Network</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 8px;color:${approved ? '#2ecc71' : '#ff6b6b'}">${approved ? '✅ Application Approved' : `Application ${kyc_status.charAt(0).toUpperCase() + kyc_status.slice(1)}`}</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">Hello ${agentName ? `<strong style="color:#f5f5f5">${agentName}</strong>` : 'there'},<br><br>
      ${approved
        ? `Your application for <strong style="color:#C9A84C">${tierName}</strong> has been approved by the B&amp;E team. You can now supervise agents and earn commissions as a ${tierName}.`
        : `Your ${tierName ? `<strong>${tierName}</strong> ` : ''}application has been <strong style="color:#ff6b6b">${kyc_status}</strong>.${notes ? `<br><br><em style="color:#888">${notes}</em>` : ''} Please contact support if you have questions.`
      }</p>
      ${approved ? `<a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">Open PAC Portal →</a>` : ''}
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.kyc.email.sent', email, kyc_status, pac_tier }))
  } catch (err) {
    console.error('[mailer] sendPacKycDecision failed:', err.message)
  }
}

// ── sendFounderWelcome ─────────────────────────────────────────────────────
// Sent when an admin grants S3 Founder status via PATCH /api/admin/pac/:id/founder.
// Communicates the full founder package: exemption, region, obligations, KYC status.
const FOUNDER_REGION_LABELS = {
  west_africa:          'West Africa',
  central_east_africa:  'Central & East Africa',
  mena:                 'Middle East & North Africa',
  europe:               'Europe & Diaspora',
  asia:                 'Asia & Oceania',
}

const sendFounderWelcome = async ({ email, full_name, region, exemption_expires }) => {
  if (!email) return
  try {
    const regionLabel = FOUNDER_REGION_LABELS[region] || region
    const expiry = new Date(exemption_expires).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    const subject = 'Welcome to MyDD PAC Network — Founding S3 Senior'
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject,
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:580px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:28px 32px">
      <p style="margin:0;font-size:0.75rem;font-weight:700;color:#111;letter-spacing:0.1em;text-transform:uppercase">MyDD PAC Network</p>
      <p style="margin:8px 0 0;font-size:1.5rem;font-weight:900;color:#111">Founding S3 Senior</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Dear <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 24px">On behalf of <strong style="color:#C9A84C">B&amp;E Consult FZCO</strong>, we are pleased to inform you that you have been personally selected as a <strong style="color:#fff">Founding PAC Senior S3</strong> of the MyDD Global Audit Network.</p>

      <h3 style="color:#C9A84C;font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px;border-bottom:1px solid #2a2a2a;padding-bottom:8px">Your Founder Package</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem;border-bottom:1px solid #1a1a1a">✅ Full S3 Senior access</td><td style="padding:7px 0;color:#fff;font-size:0.88rem;font-weight:600;text-align:right;border-bottom:1px solid #1a1a1a">Effective immediately</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem;border-bottom:1px solid #1a1a1a">✅ Membership fee ($799/yr) waived</td><td style="padding:7px 0;color:#2ecc71;font-size:0.88rem;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Until ${expiry}</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem;border-bottom:1px solid #1a1a1a">✅ Priority mission assignment</td><td style="padding:7px 0;color:#fff;font-size:0.88rem;font-weight:600;text-align:right;border-bottom:1px solid #1a1a1a">${regionLabel}</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem;border-bottom:1px solid #1a1a1a">✅ Seat on S3 Advisory Council</td><td style="padding:7px 0;color:#fff;font-size:0.88rem;font-weight:600;text-align:right;border-bottom:1px solid #1a1a1a">Quarterly calls</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem;border-bottom:1px solid #1a1a1a">✅ L1/L2/L3 mission commission</td><td style="padding:7px 0;color:#C9A84C;font-size:0.88rem;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">20%</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem;border-bottom:1px solid #1a1a1a">✅ S2 supervision bonus</td><td style="padding:7px 0;color:#C9A84C;font-size:0.88rem;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">5%</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;font-size:0.88rem">✅ S1 oversight bonus</td><td style="padding:7px 0;color:#C9A84C;font-size:0.88rem;font-weight:700;text-align:right">2%</td></tr>
      </table>

      <h3 style="color:#C9A84C;font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px;border-bottom:1px solid #2a2a2a;padding-bottom:8px">Founder Obligations</h3>
      <ul style="color:#ccc;font-size:0.88rem;line-height:1.8;margin:0 0 24px;padding-left:20px">
        <li>Recruit and onboard minimum <strong style="color:#fff">3 S2 agents</strong> within 90 days</li>
        <li>Recruit and onboard minimum <strong style="color:#fff">15 S1 agents</strong> within 180 days</li>
        <li>Submit monthly supervision report by the 3rd of each month</li>
        <li>Participate in quarterly S3 Advisory Council calls (60 min)</li>
        <li>Maintain supervision score ≥ 4.0/5.0</li>
      </ul>

      <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:16px 20px;margin-bottom:28px">
        <p style="margin:0;font-size:0.85rem;color:#888">🔍 <strong style="color:#ccc">KYC Status:</strong> Your identity verification is now under review by our compliance team. Expected completion: <strong style="color:#fff">3–5 business days</strong>.</p>
      </div>

      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:800;font-size:0.95rem;letter-spacing:0.03em">Complete your profile →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.founder.welcome.sent', email, region }))
  } catch (err) {
    console.error('[mailer] sendFounderWelcome failed:', err.message)
  }
}

// ── PAC Achievement Emails ────────────────────────────────────────────────────
// Tier label helpers
const TIER_NAMES = { s1: 'S1 Associate', s2: 'S2 Certified', s3: 'S3 Senior' }

// sendS2Eligible — fired by nightly cron when S1 meets all S2 criteria
const sendS2Eligible = async ({ email, full_name, admin_avg, missions }) => {
  if (!email) return
  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: "You've earned S2 Certified — Review in progress",
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:24px 32px">
      <p style="margin:0;font-size:1.1rem;font-weight:900;color:#111">🏅 S2 Certified — Achievement Unlocked</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Congratulations — you have met all the criteria for promotion to <strong style="color:#C9A84C">S2 Certified</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.85rem">
        <tr><td style="padding:6px 0;color:#888;border-bottom:1px solid #1a1a1a">Missions completed</td><td style="padding:6px 0;color:#2ecc71;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">${missions} ✓</td></tr>
        <tr><td style="padding:6px 0;color:#888">Admin score average</td><td style="padding:6px 0;color:#2ecc71;font-weight:700;text-align:right">${admin_avg}/5.0 ✓</td></tr>
      </table>
      <p style="color:#888;font-size:0.85rem;margin:0 0 24px">The B&amp;E team will review your profile within 48 hours. If approved, your S2 license will be activated immediately — with <strong style="color:#fff">12 months free</strong> before the first annual fee of $399.</p>
      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">View your profile →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.s2.eligible.email.sent', email }))
  } catch (err) {
    console.error('[mailer] sendS2Eligible failed:', err.message)
  }
}

// sendS2Promoted — fired by admin approve-upgrade endpoint
const sendS2Promoted = async ({ email, full_name, anniversary_date }) => {
  if (!email) return
  try {
    const anniversary = anniversary_date
      ? new Date(anniversary_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '12 months from today'
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: 'Congratulations — S2 Certified ✅',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:900;color:#111">✅ S2 Certified — Activated</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Your S2 Certified license is now <strong style="color:#2ecc71">active</strong>. Welcome to the professional tier of the MyDD PAC Network.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.85rem">
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ L1 + L2 missions</td><td style="padding:7px 0;color:#fff;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Unlocked</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ Commission</td><td style="padding:7px 0;color:#C9A84C;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">15% per mission</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ Supervision bonus</td><td style="padding:7px 0;color:#C9A84C;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">+5% on S1 org</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ Annual membership</td><td style="padding:7px 0;color:#2ecc71;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Free for 12 months</td></tr>
        <tr><td style="padding:7px 0;color:#ccc">📅 First renewal</td><td style="padding:7px 0;color:#aaa;font-weight:600;text-align:right">${anniversary}</td></tr>
      </table>
      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">Open PAC Portal →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.s2.promoted.email.sent', email }))
  } catch (err) {
    console.error('[mailer] sendS2Promoted failed:', err.message)
  }
}

// sendS3Eligible — fired by nightly cron when S2 meets all S3 criteria
const sendS3Eligible = async ({ email, full_name, admin_avg }) => {
  if (!email) return
  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: 'S3 Senior candidacy opened — Board review',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:24px 32px">
      <p style="margin:0;font-size:1.1rem;font-weight:900;color:#111">🏆 S3 Senior — Candidacy Opened</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">You have met all the performance criteria for promotion to <strong style="color:#C9A84C">S3 Senior</strong> — the highest tier of the MyDD PAC Network.</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Your file is now before the <strong style="color:#fff">S3 Senior Board</strong> (2 S3 members + 1 B&amp;E HQ representative). You will be contacted within <strong style="color:#fff">7 business days</strong> to schedule a 30-minute interview.</p>
      <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:0.85rem;color:#888">Your admin score: <strong style="color:#C9A84C">${admin_avg}/5.0</strong><br>The board will review your full track record and conduct a video interview before making their decision.</p>
      </div>
      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">View your progress →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.s3.eligible.email.sent', email }))
  } catch (err) {
    console.error('[mailer] sendS3Eligible failed:', err.message)
  }
}

// sendS3Promoted — fired by admin approve-upgrade endpoint
const sendS3Promoted = async ({ email, full_name, anniversary_date }) => {
  if (!email) return
  try {
    const anniversary = anniversary_date
      ? new Date(anniversary_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '12 months from today'
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: 'Welcome to the Elite — S3 Senior ✅',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:28px 32px">
      <p style="margin:0;font-size:0.75rem;font-weight:700;color:#111;letter-spacing:0.1em;text-transform:uppercase">MyDD PAC Network</p>
      <p style="margin:8px 0 0;font-size:1.5rem;font-weight:900;color:#111">✅ S3 Senior Certified</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">The Senior Board has approved your promotion to <strong style="color:#C9A84C">S3 Senior</strong>. You are now part of the elite tier of the MyDD PAC Network — Senior Certified Auditor.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.85rem">
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ L1 + L2 + L3 missions</td><td style="padding:7px 0;color:#fff;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Unlocked</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ Commission</td><td style="padding:7px 0;color:#C9A84C;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">20% per mission</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ S2 mentoring bonus</td><td style="padding:7px 0;color:#C9A84C;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">+5% on S2 org</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ S1 org oversight bonus</td><td style="padding:7px 0;color:#C9A84C;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">+2% on S1 org</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ Featured profile</td><td style="padding:7px 0;color:#fff;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Active</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ S3 Advisory Council</td><td style="padding:7px 0;color:#fff;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Seat reserved</td></tr>
        <tr><td style="padding:7px 0;color:#ccc;border-bottom:1px solid #1a1a1a">✅ Annual membership</td><td style="padding:7px 0;color:#2ecc71;font-weight:700;text-align:right;border-bottom:1px solid #1a1a1a">Free for 12 months</td></tr>
        <tr><td style="padding:7px 0;color:#ccc">📅 First renewal</td><td style="padding:7px 0;color:#aaa;font-weight:600;text-align:right">${anniversary}</td></tr>
      </table>
      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:800;font-size:0.95rem">Open PAC Portal →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.s3.promoted.email.sent', email }))
  } catch (err) {
    console.error('[mailer] sendS3Promoted failed:', err.message)
  }
}

// sendLicenseRenewalReminder — J-30, J-7, J-1 before tier_anniversary
const sendLicenseRenewalReminder = async ({ email, full_name, tier, anniversary_date, days_remaining, amount_usd }) => {
  if (!email) return
  try {
    const tierName   = TIER_NAMES[tier?.toLowerCase()] || tier
    const anniversary = anniversary_date
      ? new Date(anniversary_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—'
    const urgency = days_remaining <= 1 ? 'Tomorrow' : days_remaining <= 7 ? 'In 7 days' : 'In 30 days'
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: `Your ${tierName} license renews ${urgency} — $${amount_usd}`,
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#1a1a1a;border-bottom:1px solid #C9A84C;padding:20px 32px">
      <p style="margin:0;font-size:1rem;font-weight:700;color:#C9A84C">📅 License Renewal Reminder</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Your <strong style="color:#C9A84C">${tierName}</strong> annual license will be renewed on <strong style="color:#fff">${anniversary}</strong>. Your saved payment method will be charged <strong style="color:#C9A84C">$${amount_usd}</strong>.</p>
      <p style="color:#888;font-size:0.85rem;margin:0">No action required if your payment details are up to date. If you wish to downgrade, contact B&amp;E support before the renewal date.</p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.license.renewal.reminder.sent', email, tier, days_remaining }))
  } catch (err) {
    console.error('[mailer] sendLicenseRenewalReminder failed:', err.message)
  }
}

// sendLicenseSuspended — fired after J+14 payment failure (Stripe webhook)
const sendLicenseSuspended = async ({ email, full_name, tier }) => {
  if (!email) return
  try {
    const tierName = TIER_NAMES[tier?.toLowerCase()] || tier
    const downTier = tier?.toLowerCase() === 's3' ? 'S2' : 'S1'
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: `Your ${tierName} license has been suspended`,
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#1a1a1a;border-bottom:2px solid #e74c3c;padding:20px 32px">
      <p style="margin:0;font-size:1rem;font-weight:700;color:#e74c3c">⚠️ License Suspended</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">We were unable to process your <strong style="color:#C9A84C">${tierName}</strong> annual membership payment after multiple attempts. Your license has been <strong style="color:#e74c3c">suspended</strong> and your account has been downgraded to <strong style="color:#fff">${downTier}</strong>.</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Your track record and completed missions are preserved. To reinstate your ${tierName} license, please update your payment method and pay the outstanding balance through the PAC Portal.</p>
      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">Reinstate license →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.license.suspended.email.sent', email, tier }))
  } catch (err) {
    console.error('[mailer] sendLicenseSuspended failed:', err.message)
  }
}

// sendLicenseReinstated — fired when a suspended PAC pays their outstanding invoice
const sendLicenseReinstated = async ({ email, full_name, tier }) => {
  if (!email) return
  try {
    const tierName = TIER_NAMES[tier?.toLowerCase()] || tier
    await sendViaResend({
      from: FROM_ADDRESS,
      to:   email,
      subject: `Your ${tierName} license has been reinstated`,
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#C9A84C,#9A7B2E);padding:20px 32px">
      <p style="margin:0;font-size:1rem;font-weight:900;color:#111">✅ License Reinstated</p>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="color:#ccc;line-height:1.7;margin:0 0 16px">Hello <strong style="color:#fff">${full_name || 'Partner'}</strong>,</p>
      <p style="color:#ccc;line-height:1.7;margin:0 0 20px">Your payment has been received and your <strong style="color:#C9A84C">${tierName}</strong> license is now <strong style="color:#2ecc71">reinstated</strong>. All your mission access and bonuses have been restored.</p>
      <a href="https://mydd.work/pac" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#9A7B2E);color:#111;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">Open PAC Portal →</a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">B&amp;E Consult FZCO &bull; Dubai, UAE &bull; <a href="https://mydd.work" style="color:#555">mydd.work</a></td></tr>
  </table>
</body></html>`,
    })
    console.log(JSON.stringify({ event: 'pac.license.reinstated.email.sent', email, tier }))
  } catch (err) {
    console.error('[mailer] sendLicenseReinstated failed:', err.message)
  }
}

/**
 * Send a mission fee payment receipt to the company that paid.
 * Triggered by the Stripe webhook when mission_fee checkout completes.
 */
const sendMissionFeeReceipt = async ({ email, name, companyName, feeUsd, missionId }) => {
  if (!email) return

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'mission_fee_receipt.email.queued', mode: 'log_only', email, missionId, feeUsd }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Payment confirmed — Mission audit #${missionId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD — Payment Receipt</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Audit Fee Confirmed ✓</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Hi${name ? ` ${name}` : ''},<br>
        Your payment for the B&amp;E audit mission has been received and confirmed.
        Your assigned PAC agent will coordinate the audit schedule shortly.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Company</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>${companyName || '—'}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Mission #</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">#${missionId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa">Amount Paid</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:#b8972a">$${feeUsd} USD</td>
        </tr>
      </table>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/dashboard"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        View Mission Status
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; This is an automated receipt — please keep for your records.
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'mission_fee_receipt.email.sent', email, missionId, feeUsd }))
  } catch (err) {
    console.error('[mailer] sendMissionFeeReceipt failed:', err.message)
  }
}

/**
 * Notify a PAC agent that their commission for a completed & paid mission is earned.
 * Triggered by the Stripe webhook when mission_fee checkout completes.
 */
const sendMissionCommissionEarned = async ({ email, name, companyName, commissionUsd, missionId }) => {
  if (!email) return

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'mission_commission.email.queued', mode: 'log_only', email, missionId, commissionUsd }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Commission earned — Mission #${missionId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#b8972a;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD — Commission Notification</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Commission Credited 💰</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Hi${name ? ` ${name}` : ''},<br>
        Great news — the company has paid the audit fee for Mission #${missionId}.
        Your commission has been recorded and will be included in your next payout.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Company</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>${companyName || '—'}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Mission #</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">#${missionId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa">Your Commission</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:#2ecc71">+$${commissionUsd} USD</td>
        </tr>
      </table>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/pac"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        View Earnings in PAC Portal
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'mission_commission.email.sent', email, missionId, commissionUsd }))
  } catch (err) {
    console.error('[mailer] sendMissionCommissionEarned failed:', err.message)
  }
}

/**
 * Notify admin that a company has submitted a dispute on a completed mission.
 */
const sendDisputeSubmitted = async ({ adminEmail, companyName, reason, missionId, disputeId }) => {
  if (!adminEmail) return

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'dispute_submitted.email.queued', mode: 'log_only', adminEmail, disputeId, missionId }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: adminEmail,
      subject: `[Action Required] Dispute #${disputeId} — Mission #${missionId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:#c0392b;padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#fff">MyDD — Dispute Alert</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">New Dispute Submitted</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        A company has filed a dispute on a completed mission. Please review and take action.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Dispute #</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">#${disputeId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Mission #</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">#${missionId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Company</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>${companyName || '—'}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;vertical-align:top">Reason</td>
          <td style="padding:8px 0;text-align:right;color:#ff6b6b;font-style:italic">"${(reason || '').slice(0, 200)}"</td>
        </tr>
      </table>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/admin"
         style="display:inline-block;background:#c0392b;color:#fff;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        Review in Admin Panel
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'dispute_submitted.email.sent', adminEmail, disputeId, missionId }))
  } catch (err) {
    console.error('[mailer] sendDisputeSubmitted failed:', err.message)
  }
}

/**
 * Notify a company that their dispute has been resolved (upheld or dismissed).
 */
const sendDisputeResolved = async ({ email, name, companyName, missionId, disputeId, resolution, notes }) => {
  if (!email) return

  const upheld    = resolution === 'upheld'
  const accentColor = upheld ? '#2ecc71' : '#f39c12'
  const resultLabel = upheld ? '✅ Upheld — Outcome overturned' : '⚠️ Dismissed — Original outcome stands'

  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'dispute_resolved.email.queued', mode: 'log_only', email, disputeId, resolution }))
    return
  }

  try {
    await sendViaResend({
      from: FROM_ADDRESS,
      to: email,
      subject: `Dispute resolved — Mission #${missionId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:40px 16px;margin:0">
  <table style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
    <tr><td style="background:${accentColor};padding:24px 32px">
      <p style="margin:0;font-size:1.2rem;font-weight:700;color:#000">MyDD — Dispute Decision</p>
    </td></tr>
    <tr><td style="padding:32px">
      <h1 style="font-size:1.4rem;margin:0 0 16px;color:#f5f5f5">Dispute #${disputeId} Resolved</h1>
      <p style="color:#aaa;line-height:1.6;margin:0 0 24px">
        Hi${name ? ` ${name}` : ''},<br>
        The B&amp;E team has reviewed your dispute for Mission #${missionId} and reached a decision.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Company</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222"><strong>${companyName || '—'}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Mission #</td>
          <td style="padding:8px 0;text-align:right;color:#f5f5f5;border-bottom:1px solid #222">#${missionId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#aaa;border-bottom:1px solid #222">Decision</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:${accentColor}">${resultLabel}</td>
        </tr>
        ${notes ? `<tr>
          <td style="padding:8px 0;color:#aaa;vertical-align:top">Notes</td>
          <td style="padding:8px 0;text-align:right;color:#aaa;font-style:italic">"${notes.slice(0, 300)}"</td>
        </tr>` : ''}
      </table>
      <a href="${process.env.FRONTEND_URL || 'https://mydd.work'}/dashboard"
         style="display:inline-block;background:#b8972a;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none">
        View in Dashboard
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#0d0d0d;font-size:0.75rem;color:#555;text-align:center">
      B&amp;E Consult FZCO &bull; Dubai, UAE &bull; If you have further questions, contact support@mydd.work
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(JSON.stringify({ event: 'dispute_resolved.email.sent', email, disputeId, missionId, resolution }))
  } catch (err) {
    console.error('[mailer] sendDisputeResolved failed:', err.message)
  }
}

module.exports = { sendPaymentConfirmation, sendWelcome, sendPasswordReset, sendMissionAssigned, sendMissionCompleted, sendCertGranted, sendEmailVerification, sendRenewalReminder, sendCertExpired, sendOnboardingD1, sendOnboardingD3, sendSupervisionTaskReminder, sendPacMembershipConfirmation, sendPacKycDecision, sendFounderWelcome, sendS2Eligible, sendS2Promoted, sendS3Eligible, sendS3Promoted, sendLicenseRenewalReminder, sendLicenseSuspended, sendLicenseReinstated, sendMissionFeeReceipt, sendMissionCommissionEarned, sendDisputeSubmitted, sendDisputeResolved }
