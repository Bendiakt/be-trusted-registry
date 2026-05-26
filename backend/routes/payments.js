const express = require('express')
const router = express.Router()
const Stripe = require('stripe')
const { query } = require('../db')
const { auth } = require('../lib/authUtils')
const { validate, schemas } = require('../lib/validators')
const { checkFraud } = require('../lib/fraudDetection')
const { sendPaymentConfirmation } = require('../lib/mailer')
const { isBlockedCompany } = require('../lib/blocklist')

const levelFromPlanId = (planId) => {
  const map = { level1: 1, level2: 2, level3: 3 }
  return map[planId] || null
}

let _stripe = null
const getStripe = () => {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Missing STRIPE_SECRET_KEY')
    }
    _stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      timeout: 15000,
    })
  }
  return _stripe
}

const PLANS = {
  level1: { name: 'B&E Level 1 — Document Verification',    price: 49900  }, // $499/year
  level2: { name: 'B&E Level 2 — KYC Full Validation',      price: 99900  }, // $999/year
  level3: { name: 'B&E Level 3 — Physical Site Inspection', price: 249900 }, // $2,499/year
}

// Trader Portal subscriptions — recurring
const TRADER_PLANS = {
  trader_monthly: { name: 'MyDD Trader Portal — Monthly', price: 4900,  interval: 'month' },
  trader_annual:  { name: 'MyDD Trader Portal — Annual',  price: 49900, interval: 'year'  },
}

router.post('/create-checkout-session', auth, validate(schemas.createCheckoutSession), async (req, res) => {
  try {
    const { planId, certificationId } = req.body
    const plan = PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Invalid plan' })

    // Resolve companyId from authenticated user (req.user set by auth middleware)
    const companyResult = await query('SELECT id, name FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const userCompany = companyResult.rows[0]
    if (!userCompany) {
      return res.status(400).json({ error: 'Register your company profile before checkout' })
    }

    // Block operator's own entities from purchasing certification
    if (isBlockedCompany(userCompany.name)) {
      return res.status(403).json({ error: 'This company cannot be certified on this platform.' })
    }

    const resolvedCompanyId = String(userCompany.id)

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          product_data: { name: plan.name, description: 'MyDD Certification — Annual subscription' },
          unit_amount:  plan.price,
          recurring:    { interval: 'year' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success&plan=${planId}`,
      cancel_url:  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=cancelled`,
      subscription_data: {
        metadata: {
          planId,
          companyId:        resolvedCompanyId,
          userId:           String(req.user.id),
          certificationId:  certificationId ? String(certificationId) : '',
          subscriptionType: 'company_certification',
        },
      },
      metadata: {
        planId,
        companyId:        resolvedCompanyId,
        userId:           String(req.user.id),
        certificationId:  certificationId ? String(certificationId) : '',
        subscriptionType: 'company_certification',
      },
      customer_email: req.user.email || undefined,
    })

    await query(
      `INSERT INTO payments (user_id, company_id, stripe_session_id, amount_cents, currency, plan_id, status, certification_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       ON CONFLICT (stripe_session_id)
       DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         currency = EXCLUDED.currency,
         plan_id = EXCLUDED.plan_id,
         certification_id = EXCLUDED.certification_id,
         updated_at = NOW()`,
      [req.user.id, parseInt(resolvedCompanyId, 10), session.id, plan.price, 'usd', planId, certificationId || null]
    )

    res.json({ url: session.url })
  } catch (err) {
    console.error(JSON.stringify({ event: 'payments.checkout.error', userId: req.user?.id, err: err.message, code: err.code, type: err.type }))
    if (err.message === 'Missing STRIPE_SECRET_KEY') {
      return res.status(500).json({ error: 'Server payment configuration is incomplete' })
    }

    if (err.type === 'StripeConnectionError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Payment provider is temporarily unreachable. Please retry in a minute.' })
    }

    if (err.type === 'StripeAuthenticationError') {
      return res.status(500).json({ error: 'Payment configuration is invalid. Please contact support.' })
    }

    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid payment request. Please refresh and try again.' })
    }

    res.status(500).json({ error: 'Payment session failed. Please try again later.' })
  }
})

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']

  // Early guard: stripe-signature header must be present
  if (!sig) {
    console.warn(JSON.stringify({ event: 'stripe.webhook.rejected', reason: 'missing_header', path: '/api/payments/webhook', ts: new Date().toISOString() }))
    return res.status(400).send('Missing stripe-signature header')
  }

  let event
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(500).send('Missing STRIPE_WEBHOOK_SECRET')
    }
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '')
    console.log(JSON.stringify({
      event: 'stripe.webhook.received',
      stripeEventId: event.id,
      stripeEventType: event.type,
    }))
  } catch (err) {
    console.warn(JSON.stringify({ event: 'stripe.webhook.sig_failed', err: err.message, code: err.code, ts: new Date().toISOString() }))
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const { planId, companyId, certificationId, userId } = session.metadata || {}
      const planLevel = levelFromPlanId(planId)
      console.log(JSON.stringify({
        event: 'stripe.payment.confirmed',
        message: 'webhook event received',
        stripeEventId: event.id,
        sessionId: session.id,
        planId,
        companyId,
        amountTotal: session.amount_total,
        currency: session.currency,
      }))

      const resolvedCompanyId = companyId ? parseInt(companyId, 10) : null
      const resolvedUserId = userId ? parseInt(userId, 10) : null
      const { subscriptionType: sesSubType, pacProfileId, nextTier, fromTier } = session.metadata || {}

      // ── PAC membership upgrade ────────────────────────────────────────────────
      if (sesSubType === 'pac_membership' && pacProfileId && nextTier) {
        const pacId = parseInt(pacProfileId, 10)
        await query(
          `UPDATE pac_profiles
             SET pac_tier    = $1,
                 kyc_status  = 'pending',
                 updated_at  = NOW()
           WHERE id = $2`,
          [nextTier, pacId]
        )

        // Notify admins
        const agentResult = await query(
          `SELECT pp.full_name, u.email
             FROM pac_profiles pp JOIN users u ON u.id = pp.user_id
            WHERE pp.id = $1 LIMIT 1`,
          [pacId]
        )
        const agentName = agentResult.rows[0]?.full_name || agentResult.rows[0]?.email || `PAC #${pacId}`

        query(`
          INSERT INTO notifications (user_id, type, title, body)
          SELECT id, 'info', $1, $2
            FROM users WHERE role = 'admin' LIMIT 3
        `, [
          `PAC Upgrade Payment: ${nextTier}`,
          `${agentName} paid for ${nextTier} membership upgrade (from ${fromTier || '?'}). KYC review required.`,
        ]).catch(() => {})

        console.log(JSON.stringify({
          event:     'pac.upgrade.paid',
          pacId,
          fromTier,
          nextTier,
          sessionId: session.id,
          stripeEventId: event.id,
        }))

        return res.json({ received: true })
      }

      await query(
        `UPDATE payments
         SET status = 'completed',
             stripe_payment_intent_id = $1,
             updated_at = NOW()
         WHERE stripe_session_id = $2`,
        [session.payment_intent ? String(session.payment_intent) : null, session.id]
      )

      if (!resolvedCompanyId || !planLevel) {
        return res.json({ received: true })
      }

      let effectiveCertificationId = certificationId ? parseInt(certificationId, 10) : null
      if (effectiveCertificationId) {
        await query(
          `UPDATE certifications
           SET status = 'submitted',
               payment_confirmed = TRUE,
               level = GREATEST(level, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [planLevel, effectiveCertificationId]
        )
      } else {
        const createdCert = await query(
          `INSERT INTO certifications (company_id, level, status, payment_confirmed)
           VALUES ($1, $2, 'submitted', TRUE)
           RETURNING id`,
          [resolvedCompanyId, planLevel]
        )
        effectiveCertificationId = createdCert.rows[0].id
      }

      await query(
        `UPDATE payments
         SET certification_id = COALESCE(certification_id, $1),
             updated_at = NOW()
         WHERE stripe_session_id = $2`,
        [effectiveCertificationId, session.id]
      )

      let companyUserId = null

      // Update company certification level + mark verified + store Stripe customer_id
      await query(
        `UPDATE companies
         SET certification_level = GREATEST(certification_level, $1),
             verified_at = COALESCE(verified_at, NOW()),
             stripe_customer_id = COALESCE(stripe_customer_id, $3),
             updated_at = NOW()
         WHERE id = $2`,
        [planLevel, resolvedCompanyId, session.customer || null]
      )

      // Stamp certification with granted_at and expires_at (1 year)
      if (effectiveCertificationId) {
        await query(
          `UPDATE certifications
           SET status = 'active',
               granted_at = COALESCE(granted_at, NOW()),
               expires_at = COALESCE(expires_at, NOW() + INTERVAL '1 year'),
               updated_at = NOW()
           WHERE id = $1`,
          [effectiveCertificationId]
        )
      }

      const companyResult = await query('SELECT user_id FROM companies WHERE id = $1 LIMIT 1', [resolvedCompanyId])
      companyUserId = companyResult.rows[0]?.user_id || resolvedUserId || null

      console.log(JSON.stringify({
        event: 'company.certification.upgraded',
        companyId: resolvedCompanyId,
        certificationLevel: planLevel,
        certificationId: effectiveCertificationId,
        stripeEventId: event.id,
      }))

      const companyNameResult = await query('SELECT name, country FROM companies WHERE id = $1 LIMIT 1', [resolvedCompanyId])
      const companyRow = companyNameResult.rows[0] || {}

      // Level 3: auto-create a PAC site inspection mission (one per company max)
      if (planLevel === 3) {
        await query(
          `INSERT INTO missions (company_id, company_name, location, type, description, status, fee_usd)
           SELECT $1, $2, $3, 'site_inspection', $4, 'available', 500
           WHERE NOT EXISTS (
             SELECT 1 FROM missions WHERE company_id = $1 AND type = 'site_inspection'
           )`,
          [
            resolvedCompanyId,
            companyRow.name || null,
            companyRow.country || null,
            `Site inspection for Level 3 certification — ${companyRow.name || 'company #' + resolvedCompanyId}`,
          ]
        ).catch((e) => console.error(JSON.stringify({ event: 'payments.mission_auto_create.error', err: e.message })))
        console.log(JSON.stringify({ event: 'mission.created', companyId: resolvedCompanyId, level: 3 }))
      }

      await sendPaymentConfirmation({
        email: session.customer_details?.email || session.customer_email || null,
        amountCents: session.amount_total || 0,
        level: planLevel,
        companyName: companyRow.name || null,
      })

      // Stripe Radar + dispute risk signals (if payment_intent is available)
      let stripeRiskLevel = null
      let stripeDisputed = false
      if (session.payment_intent) {
        try {
          const pi = await getStripe().paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] })
          const latestCharge = pi.latest_charge
          stripeRiskLevel = latestCharge?.outcome?.risk_level || null
          stripeDisputed = Boolean(latestCharge?.disputed)
          console.log(JSON.stringify({
            event: 'stripe.risk.signal',
            stripeEventId: event.id,
            paymentIntent: session.payment_intent,
            riskLevel: stripeRiskLevel,
            disputed: stripeDisputed,
          }))
        } catch (riskErr) {
          console.warn(JSON.stringify({ event: 'stripe.risk.fetch_failed', err: riskErr.message }))
        }
      }

      await checkFraud({
        userId: companyUserId,
        companyId: companyId ? parseInt(companyId, 10) : null,
        action: 'stripe_webhook',
        stripeRiskLevel,
        stripeDisputed,
      }).catch((fraudErr) => {
        console.error(JSON.stringify({ event: 'payments.fraud_check.error', err: fraudErr.message }))
      })
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object
      await query(
        `UPDATE payments
         SET status = 'failed',
             stripe_payment_intent_id = $1,
             updated_at = NOW()
         WHERE stripe_payment_intent_id = $1 OR stripe_session_id = $2`,
        [String(pi.id), pi.metadata?.checkout_session_id || '']
      )
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object
      await query(
        `UPDATE payments
         SET status = 'refunded',
             updated_at = NOW()
         WHERE stripe_payment_intent_id = $1`,
        [String(charge.payment_intent || '')]
      )
    }

    // ── invoice.paid ────────────────────────────────────────────────────────────
    // Fires when a subscription renews automatically (or first invoice on subscribe).
    // Handles two subscription types:
    //   - trader_portal  → activate/renew trader access on users table
    //   - company cert   → extend certification by 1 year on certifications table
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object

      // Only process subscription invoices (not one-time charges)
      if (!invoice.subscription) {
        console.log(JSON.stringify({ event: 'stripe.invoice.paid.skipped', reason: 'no_subscription', invoiceId: invoice.id }))
        return res.json({ received: true })
      }

      const customerId = invoice.customer
      if (!customerId) {
        console.warn(JSON.stringify({ event: 'stripe.invoice.paid.no_customer', invoiceId: invoice.id }))
        return res.json({ received: true })
      }

      // Resolve plan from subscription line items metadata or price metadata
      const lineItem        = invoice.lines?.data?.[0]
      const planId          = lineItem?.metadata?.planId
                           || lineItem?.price?.metadata?.planId
                           || null
      const subscriptionType = lineItem?.metadata?.subscriptionType
                            || lineItem?.price?.metadata?.subscriptionType
                            || null
      const isTrader        = subscriptionType === 'trader_portal'
                           || planId === 'trader_monthly'
                           || planId === 'trader_annual'

      // ── TRADER subscription ──────────────────────────────────────────────────
      if (isTrader) {
        const userResult = await query(
          'SELECT id, email, name FROM users WHERE stripe_customer_id = $1 LIMIT 1',
          [customerId]
        )
        let user = userResult.rows[0]

        // First invoice: store stripe_customer_id on the user
        if (!user) {
          // Try to find by email from invoice
          const email = invoice.customer_email
          if (email) {
            const byEmail = await query('SELECT id, email, name FROM users WHERE email = $1 LIMIT 1', [email])
            user = byEmail.rows[0]
          }
          if (user) {
            await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id])
          }
        }

        if (!user) {
          console.warn(JSON.stringify({ event: 'stripe.invoice.paid.trader_not_found', customerId, invoiceId: invoice.id }))
          return res.json({ received: true })
        }

        // Retrieve subscription to get period end
        const sub = await getStripe().subscriptions.retrieve(invoice.subscription)
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null

        await query(
          `UPDATE users
           SET stripe_customer_id      = $1,
               stripe_subscription_id  = $2,
               subscription_status     = 'active',
               subscription_plan       = $3,
               subscription_period_end = $4,
               updated_at              = NOW()
           WHERE id = $5`,
          [customerId, invoice.subscription, planId || 'trader_monthly', periodEnd, user.id]
        )

        console.log(JSON.stringify({
          event:          'trader.subscription.activated',
          userId:         user.id,
          planId,
          invoiceId:      invoice.id,
          subscriptionId: invoice.subscription,
          periodEnd,
        }))

        return res.json({ received: true })
      }

      // ── COMPANY certification subscription ───────────────────────────────────
      const planLevel = levelFromPlanId(planId)

      const companyResult = await query(
        'SELECT id, name, user_id FROM companies WHERE stripe_customer_id = $1 LIMIT 1',
        [customerId]
      )
      const company = companyResult.rows[0]

      if (!company) {
        console.warn(JSON.stringify({
          event:      'stripe.invoice.paid.company_not_found',
          customerId,
          invoiceId:  invoice.id,
        }))
        return res.json({ received: true })
      }

      console.log(JSON.stringify({
        event:          'stripe.invoice.paid',
        invoiceId:      invoice.id,
        customerId,
        companyId:      company.id,
        subscriptionId: invoice.subscription,
        amountPaid:     invoice.amount_paid,
        planId,
        planLevel,
      }))

      // Record the payment row (idempotent via invoice.id as unique key)
      await query(
        `INSERT INTO payments
           (user_id, company_id, stripe_session_id, stripe_payment_intent_id,
            amount_cents, currency, plan_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
         ON CONFLICT (stripe_session_id) DO NOTHING`,
        [
          company.user_id,
          company.id,
          invoice.id,
          invoice.payment_intent ? String(invoice.payment_intent) : null,
          invoice.amount_paid || 0,
          invoice.currency || 'usd',
          planId || null,
        ]
      )

      // Extend or create certification: push expires_at forward by 1 year
      if (planLevel) {
        const certResult = await query(
          `SELECT id, expires_at FROM certifications
           WHERE company_id = $1
             AND level = $2
             AND status IN ('active', 'expired')
           ORDER BY created_at DESC
           LIMIT 1`,
          [company.id, planLevel]
        )
        const cert = certResult.rows[0]

        if (cert) {
          await query(
            `UPDATE certifications
             SET expires_at  = GREATEST(expires_at, NOW()) + INTERVAL '1 year',
                 status      = 'active',
                 updated_at  = NOW()
             WHERE id = $1`,
            [cert.id]
          )
          console.log(JSON.stringify({
            event:           'certification.renewed',
            companyId:       company.id,
            certificationId: cert.id,
            planLevel,
            invoiceId:       invoice.id,
          }))
          await query(
            `UPDATE payments SET certification_id = $1 WHERE stripe_session_id = $2`,
            [cert.id, invoice.id]
          )
        } else {
          const newCert = await query(
            `INSERT INTO certifications (company_id, level, status, payment_confirmed, granted_at, expires_at)
             VALUES ($1, $2, 'active', TRUE, NOW(), NOW() + INTERVAL '1 year')
             RETURNING id`,
            [company.id, planLevel]
          )
          const newCertId = newCert.rows[0]?.id
          console.log(JSON.stringify({
            event:           'certification.created_via_subscription',
            companyId:       company.id,
            certificationId: newCertId,
            planLevel,
            invoiceId:       invoice.id,
          }))
          await query(
            `UPDATE payments SET certification_id = $1 WHERE stripe_session_id = $2`,
            [newCertId, invoice.id]
          )
        }

        await query(
          `UPDATE companies
           SET certification_level = GREATEST(certification_level, $1),
               updated_at          = NOW()
           WHERE id = $2`,
          [planLevel, company.id]
        )
      }

      await sendPaymentConfirmation({
        email:       invoice.customer_email || null,
        amountCents: invoice.amount_paid || 0,
        level:       planLevel,
        companyName: company.name || null,
      }).catch((mailErr) => {
        console.error(JSON.stringify({ event: 'invoice.paid.mail_failed', err: mailErr.message }))
      })
    }

    // ── customer.subscription.deleted ───────────────────────────────────────────
    // Fires when a subscription is cancelled (immediately or at period end).
    // Handles both trader portal cancellation and company certification expiry.
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const customerId   = subscription.customer

      if (!customerId) {
        console.warn(JSON.stringify({ event: 'stripe.subscription.deleted.no_customer', subscriptionId: subscription.id }))
        return res.json({ received: true })
      }

      // Check if this is a trader subscription
      const traderResult = await query(
        'SELECT id, name FROM users WHERE stripe_customer_id = $1 AND role = $2 LIMIT 1',
        [customerId, 'trader']
      )
      const traderUser = traderResult.rows[0]

      if (traderUser) {
        await query(
          `UPDATE users
           SET subscription_status    = 'cancelled',
               stripe_subscription_id = NULL,
               updated_at             = NOW()
           WHERE id = $1`,
          [traderUser.id]
        )
        console.log(JSON.stringify({
          event:          'trader.subscription.cancelled',
          userId:         traderUser.id,
          subscriptionId: subscription.id,
        }))
        return res.json({ received: true })
      }

      // Otherwise treat as company certification subscription
      const companyResult = await query(
        'SELECT id, name FROM companies WHERE stripe_customer_id = $1 LIMIT 1',
        [customerId]
      )
      const company = companyResult.rows[0]

      if (!company) {
        console.warn(JSON.stringify({
          event:          'stripe.subscription.deleted.entity_not_found',
          customerId,
          subscriptionId: subscription.id,
        }))
        return res.json({ received: true })
      }

      await query(
        `UPDATE certifications
         SET status     = 'expired',
             updated_at = NOW()
         WHERE company_id = $1
           AND status = 'active'`,
        [company.id]
      )

      await query(
        `UPDATE companies
         SET certification_level = 0,
             updated_at          = NOW()
         WHERE id = $1`,
        [company.id]
      )

      console.log(JSON.stringify({
        event:          'subscription.cancelled',
        companyId:      company.id,
        companyName:    company.name,
        subscriptionId: subscription.id,
        customerId,
      }))
    }

    res.json({ received: true })
  } catch (err) {
    console.error(JSON.stringify({ event: 'stripe.webhook.processing_error', err: err.message }))
    res.status(500).send('Webhook processing failed')
  }
})

router.get('/stats', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const stats = await query('SELECT * FROM revenue_stats LIMIT 1')
    const row = stats.rows[0] || {
      revenue_total_cents: 0,
      revenue_total_usd: 0,
      payments_completed: 0,
    }
    res.json({
      revenue_total_cents: parseInt(row.revenue_total_cents || '0', 10),
      revenue_total_usd: parseFloat(row.revenue_total_usd || 0),
      payments_completed: parseInt(row.payments_completed || '0', 10),
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'payments.stats.error', err: err.message }))
    res.status(500).json({ error: 'Failed to load payment stats' })
  }
})

// POST /api/payments/portal — Stripe Customer Portal for billing history & receipts
router.post('/portal', auth, async (req, res) => {
  try {
    const stripe = getStripe()

    // Look up stripe_customer_id stored on their company
    const companyResult = await query(
      'SELECT stripe_customer_id FROM companies WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    )
    let customerId = companyResult.rows[0]?.stripe_customer_id

    // Fallback: search Stripe by email
    if (!customerId && req.user.email) {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 })
      if (customers.data.length) {
        customerId = customers.data[0].id
        // Persist for next time
        if (companyResult.rows[0]) {
          await query(
            'UPDATE companies SET stripe_customer_id = $1 WHERE user_id = $2',
            [customerId, req.user.id]
          ).catch(() => {})
        }
      }
    }

    if (!customerId) {
      return res.status(404).json({ error: 'No billing account found. Complete a payment first.' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error(JSON.stringify({ event: 'payments.portal.error', userId: req.user?.id, err: err.message }))
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Billing portal unavailable. Please contact support.' })
    }
    res.status(500).json({ error: 'Failed to open billing portal' })
  }
})

// ── POST /api/payments/renewal-checkout ──────────────────────────────────────
// Creates a Stripe Checkout session specifically for renewing an active or
// recently-expired certification. The new session links to the existing cert
// so the webhook can extend expires_at rather than creating a duplicate cert.
router.post('/renewal-checkout', auth, validate(schemas.renewalCheckout), async (req, res) => {
  try {
    const companyResult = await query(
      'SELECT id, name FROM companies WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    )
    const company = companyResult.rows[0]
    if (!company) return res.status(400).json({ error: 'No company profile found' })

    if (isBlockedCompany(company.name)) {
      return res.status(403).json({ error: 'This company cannot be certified on this platform.' })
    }

    // Find the most recent cert that is active or expired (reneweable)
    const certResult = await query(
      `SELECT id, level, status, expires_at
         FROM certifications
        WHERE company_id = $1
          AND status IN ('active', 'expired')
        ORDER BY created_at DESC
        LIMIT 1`,
      [company.id]
    )
    const cert = certResult.rows[0]
    if (!cert) return res.status(404).json({ error: 'No certification eligible for renewal' })

    const planMap = { 1: 'level1', 2: 'level2', 3: 'level3' }
    const planId  = planMap[cert.level]
    const plan    = PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Unknown certification level' })

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          product_data: {
            name:        `${plan.name} — Renewal`,
            description: `Renewing annual certification for ${company.name}`,
          },
          unit_amount: plan.price,
          recurring:   { interval: 'year' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success&plan=${planId}&renewal=1`,
      cancel_url:  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=cancelled`,
      subscription_data: {
        metadata: {
          planId,
          companyId:        String(company.id),
          userId:           String(req.user.id),
          certificationId:  String(cert.id),
          isRenewal:        'true',
          subscriptionType: 'company_certification',
        },
      },
      metadata: {
        planId,
        companyId:        String(company.id),
        userId:           String(req.user.id),
        certificationId:  String(cert.id),
        isRenewal:        'true',
        subscriptionType: 'company_certification',
      },
      customer_email: req.user.email || undefined,
    })

    await query(
      `INSERT INTO payments (user_id, company_id, stripe_session_id, amount_cents, currency, plan_id, status, certification_id)
       VALUES ($1, $2, $3, $4, 'usd', $5, 'pending', $6)
       ON CONFLICT (stripe_session_id) DO NOTHING`,
      [req.user.id, company.id, session.id, plan.price, planId, cert.id]
    )

    res.json({ url: session.url, certId: cert.id, level: cert.level })
  } catch (err) {
    console.error(JSON.stringify({ event: 'payments.renewal_checkout.error', userId: req.user?.id, err: err.message }))
    if (err.message === 'Missing STRIPE_SECRET_KEY') {
      return res.status(500).json({ error: 'Server payment configuration is incomplete' })
    }
    res.status(500).json({ error: 'Failed to create renewal session' })
  }
})

// ── POST /api/payments/trader-checkout ───────────────────────────────────────
// Creates a Stripe Subscription Checkout session for Trader Portal access.
// planId: 'trader_monthly' ($49/mo) or 'trader_annual' ($499/yr)
// On success Stripe fires invoice.paid → we activate the user's subscription.
router.post('/trader-checkout', auth, async (req, res) => {
  try {
    if (req.user.role !== 'trader') {
      return res.status(403).json({ error: 'Only trader accounts can subscribe to the Trader Portal' })
    }

    const { planId } = req.body
    if (!planId || !TRADER_PLANS[planId]) {
      return res.status(400).json({ error: 'Invalid planId. Use trader_monthly or trader_annual' })
    }

    const plan = TRADER_PLANS[planId]

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency:    'usd',
          product_data: { name: plan.name, description: 'MyDD Trader Portal access' },
          unit_amount:  plan.price,
          recurring:    { interval: plan.interval },
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/trader?subscription=success&plan=${planId}`,
      cancel_url:  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/trader?subscription=cancelled`,
      customer_email: req.user.email || undefined,
      metadata: {
        userId: String(req.user.id),
        planId,
        subscriptionType: 'trader_portal',
      },
    })

    console.log(JSON.stringify({
      event:   'trader.checkout.created',
      userId:  req.user.id,
      planId,
      session: session.id,
    }))

    res.json({ url: session.url })
  } catch (err) {
    console.error(JSON.stringify({ event: 'payments.trader_checkout.error', userId: req.user?.id, err: err.message }))
    if (err.message === 'Missing STRIPE_SECRET_KEY') {
      return res.status(500).json({ error: 'Server payment configuration is incomplete' })
    }
    res.status(500).json({ error: 'Failed to create trader subscription session' })
  }
})

// ── GET /api/payments/trader-subscription ────────────────────────────────────
// Returns the current trader's subscription status (used by frontend gating).
router.get('/trader-subscription', auth, async (req, res) => {
  try {
    if (req.user.role !== 'trader' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const result = await query(
      `SELECT subscription_status, subscription_plan, subscription_period_end
         FROM users WHERE id = $1`,
      [req.user.id]
    )
    const row = result.rows[0] || {}
    res.json({
      status:    row.subscription_status    || 'inactive',
      plan:      row.subscription_plan      || null,
      periodEnd: row.subscription_period_end || null,
      active:    row.subscription_status === 'active',
    })
  } catch (err) {
    console.error(JSON.stringify({ event: 'payments.trader_subscription.error', userId: req.user?.id, err: err.message }))
    res.status(500).json({ error: 'Failed to load subscription status' })
  }
})

// ── POST /api/payments/pac-upgrade-checkout ──────────────────────────────────
// Creates a Stripe Checkout Session for a PAC tier upgrade (S1→S2 or S2→S3).
// The agent is redirected to Stripe; on payment the webhook sets
// kyc_status='pending' and notifies admins.
// ─────────────────────────────────────────────────────────────────────────────
const PAC_PRICE_IDS = {
  S2: process.env.STRIPE_PAC_S2_PRICE_ID,
  S3: process.env.STRIPE_PAC_S3_PRICE_ID,
}
const PAC_UPGRADE_NAMES = {
  S2: 'MyDD PAC Certified S2 — Annual Membership ($399/yr)',
  S3: 'MyDD PAC Senior S3 — Annual Membership ($799/yr)',
}
const MIN_MISSIONS_UPGRADE = { S2: 5, S3: 10 }

router.post('/pac-upgrade-checkout', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') {
      return res.status(403).json({ error: 'Only PAC agents can upgrade' })
    }

    // Fetch current PAC profile
    const { rows: pacRows } = await query(
      `SELECT pp.id, pp.pac_tier, pp.kyc_status, u.email
         FROM pac_profiles pp JOIN users u ON u.id = pp.user_id
        WHERE pp.user_id = $1 LIMIT 1`,
      [req.user.id]
    )
    const pac = pacRows[0]
    if (!pac) return res.status(403).json({ error: 'PAC profile not found' })

    const nextTier = pac.pac_tier === 'S1' ? 'S2' : pac.pac_tier === 'S2' ? 'S3' : null
    if (!nextTier) return res.status(400).json({ error: 'Already at maximum tier (S3)' })

    // Minimum missions check
    const { rows: mRows } = await query(
      `SELECT COUNT(*) AS cnt FROM missions WHERE assigned_to = $1 AND status = 'completed'`,
      [req.user.id]
    )
    const completed = parseInt(mRows[0].cnt, 10)
    const required  = MIN_MISSIONS_UPGRADE[nextTier]
    if (completed < required) {
      return res.status(400).json({
        error: `You need at least ${required} completed missions to upgrade to ${nextTier}. You have ${completed}.`,
        completed, required,
      })
    }

    const priceId = PAC_PRICE_IDS[nextTier]
    if (!priceId) {
      console.error(JSON.stringify({ event: 'pac.upgrade_checkout.missing_price', nextTier }))
      return res.status(500).json({ error: 'Membership price not configured. Please contact support.' })
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/pac?upgrade=success&tier=${nextTier}`,
      cancel_url:  `${frontendUrl}/pac?upgrade=cancelled`,
      customer_email: pac.email || undefined,
      metadata: {
        userId:           String(req.user.id),
        pacProfileId:     String(pac.id),
        fromTier:         pac.pac_tier,
        nextTier,
        subscriptionType: 'pac_membership',
      },
    })

    console.log(JSON.stringify({
      event:     'pac.upgrade_checkout.created',
      userId:    req.user.id,
      fromTier:  pac.pac_tier,
      nextTier,
      sessionId: session.id,
    }))

    res.json({ url: session.url })
  } catch (err) {
    console.error(JSON.stringify({ event: 'pac.upgrade_checkout.error', userId: req.user?.id, err: err.message }))
    if (err.message === 'Missing STRIPE_SECRET_KEY') {
      return res.status(500).json({ error: 'Server payment configuration is incomplete' })
    }
    res.status(500).json({ error: 'Failed to create upgrade session. Please try again.' })
  }
})

module.exports = { router, TRADER_PLANS }
