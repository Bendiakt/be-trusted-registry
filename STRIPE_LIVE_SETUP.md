# Stripe LIVE Configuration Guide

## 🚀 Pre-Requisites
- Stripe account with billing verified
- Admin access to Stripe Dashboard
- B&E Registry backend service on Railway
- Webhook endpoint accessible from public domain

---

## **STEP 1: Get Your Live Keys from Stripe Dashboard**

### Access Dashboard
1. Go to https://dashboard.stripe.com
2. Make sure you're viewing **LIVE mode** (toggle at top-right)
3. NOT TEST mode - verify the toggle shows "Live"

### Navigate to API Keys
1. Left sidebar → **Developers** → **API Keys**
2. You should see two sections:
   - **Live Keys** (green background)
   - **Test Keys** (hidden by default, click "View test data")

### Copy Live Secret Key
- Find the "Secret key" under Live Keys section
- It starts with `sk_live_...`
- Click to reveal or copy icon
- **IMPORTANT**: Never share this key publicly!

### Find Webhook Secret
1. Left sidebar → **Developers** → **Webhooks**
2. Scroll to "Endpoints"
3. Look for endpoint matching your domain: `https://be-trusted-registry-production.up.railway.app/api/payments/webhook`
4. Click on it to view details
5. Under "Signing secret", click "Reveal" to see the secret
6. It starts with `whsec_...`

---

## **STEP 2: Update Backend Environment Variables**

### On Railway Dashboard

1. Go to your Railway project: https://railway.app/project/397377c8-5ca7-449d-915e-13deaf3ada76
2. Select **Backend Service**
3. Click **Variables** (or Environment tab)
4. Update these variables:

| Variable | Old Value | New Value |
|----------|-----------|-----------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_YOUR_WEBHOOK_SECRET_HERE` | `whsec_...` |

5. Click **Save** or **Deploy**
6. Backend will automatically redeploy with new environment

### OR via Railway CLI

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx @railway/cli@latest variable set STRIPE_SECRET_KEY sk_live_YOUR_LIVE_KEY_HERE
NODE_TLS_REJECT_UNAUTHORIZED=0 npx @railway/cli@latest variable set STRIPE_WEBHOOK_SECRET whsec_YOUR_WEBHOOK_SECRET_HERE
```

Then redeploy:
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx @railway/cli@latest deploy
```

---

## **STEP 3: Verify Webhook Configuration**

### Create Test Webhook Endpoint (if needed)

If you don't already have the endpoint configured:

1. Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://be-trusted-registry-production.up.railway.app/api/payments/webhook`
4. Select events to listen for:
   - ✓ `charge.succeeded`
   - ✓ `charge.failed`
   - ✓ `payment_intent.succeeded`
   - ✓ `payment_intent.canceled`
   - ✓ `invoice.payment_succeeded`
5. Click **Add endpoint**
6. Copy the signing secret (starts with `whsec_`)
7. Update `STRIPE_WEBHOOK_SECRET` in backend environment

### Test Webhook Delivery

1. In the Webhooks section, click your endpoint
2. Scroll to "Events"
3. Click **Send test webhook**
4. Select event type (e.g., `payment_intent.succeeded`)
5. Click **Send test event**
6. Check if Railway logs show the webhook being received

---

## **STEP 4: Validate Configuration**

### Test 1: Health Check
```bash
curl -s https://be-trusted-registry-production.up.railway.app/api/health | jq .
# Expected: {"status":"ok","timestamp":"..."}
```

### Test 2: Create Checkout Session (LIVE MODE)
```bash
curl -X POST https://be-trusted-registry-production.up.railway.app/api/payments/create-checkout-session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"level1"}' | jq .

# Expected: {"url":"https://checkout.stripe.com/pay/cs_..."}
```

### Test 3: Send Test Webhook
```bash
curl -X POST https://be-trusted-registry-production.up.railway.app/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: test_signature_invalid_for_demo" \
  -d '{"type":"charge.succeeded","data":{"object":{"id":"ch_live_...", "amount":5000}}}'

# Expected:  Webhook Error (because signature won't validate with test signature)
# But it means the endpoint is reachable and processing
```

---

## **STEP 5: Production Readiness Checklist**

- [ ] Stripe account billing verified and activated
- [ ] Live API keys obtained from Stripe Dashboard
- [ ] `STRIPE_SECRET_KEY` updated to `sk_live_...` on Railway
- [ ] `STRIPE_WEBHOOK_SECRET` updated to `whsec_...` on Railway
- [ ] Webhook endpoint is registered in Stripe Dashboard
- [ ] Backend redeplored after environment variables updated
- [ ] Health check endpoint responds: `GET /api/health` → 200 OK
- [ ] Test checkout session creation with Bearer token authentication
- [ ] Webhook test event sent and received successfully
- [ ] No 502 errors on public domain
- [ ] API responds with proper Stripe URLs (not test mode URLs)

---

## **STEP 6: Monitor Transactions**

### Real-time Monitoring
1. Stripe Dashboard → **Payments**
2. Monitor live transactions as they come through
3. Dashboard → **Events** to track webhook deliveries
4. Railway → Backend Logs to track server-side processing

### Revenue Dashboard
1. Stripe Dashboard → **Home**
2. See live revenue metrics
3. Download reports for accounting

---

## **⚠️ IMPORTANT NOTES**

### Security Best Practices
- **Never log secret keys** (backend strips them from logs)
- **Rotate webhook secrets** periodically
- **Use environment variables** - never hardcode keys
- **Test mode vs Live mode** - make sure toggle is correct before copying keys

### Transaction Testing  
- **Live Mode**: Real charges will be processed (use test cards if needed)
- **Test Mode** (current): Charges are **not** processed - only for development
- Test Cards in Live Mode:
  - Use Stripe's test card numbers
  - Live mode still supports test cards for verification

### Rollback Plan
If issues occur:
```bash
# Revert to test keys
NODE_TLS_REJECT_UNAUTHORIZED=0 npx @railway/cli@latest variable set STRIPE_SECRET_KEY "sk_test_YOUR_OLD_KEY"
NODE_TLS_REJECT_UNAUTHORIZED=0 npx @railway/cli@latest deploy
```

---

## **Questions or Issues?**

Check:
1. Railway logs for errors: `npx @railway/cli@latest logs`
2. Stripe Dashboard → **Events** for webhook status
3. Stripe Dashboard → **Developers** → **API Reference** for endpoint details
4. Contact Stripe support: https://support.stripe.com

---

**Last Updated**: April 8, 2026  
**Status**: Ready for Live Configuration
