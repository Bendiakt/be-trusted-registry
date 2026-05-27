# Staging Environment Setup

This document covers how the MyDD staging environment is provisioned and how the
CI gate (`staging-health` job) is activated.

---

## Railway Staging Service

The staging environment mirrors production but uses separate Railway services and
a separate PostgreSQL database.

| Setting | Value |
|---------|-------|
| Environment | `staging` |
| API URL | `https://api-staging.mydd.work` *(update once provisioned)* |
| Frontend URL | `https://staging.mydd.work` *(update once provisioned)* |
| Branch | `staging` |
| Deploy trigger | Push to `staging` branch |

### Provisioning steps

1. **Create a new Railway project** (or add a service to the existing project):
   - Service name: `api-staging`
   - Source: this repository, branch `staging`
   - Root directory: `backend`
   - Start command: `node server.js`

2. **Add a PostgreSQL plugin** to the staging project.
   Railway auto-sets `DATABASE_URL` in the service environment.

3. **Run migrations on first deploy:**
   Railway auto-runs `npm run migrate` if you add a release command, or run it manually:
   ```
   railway run --service api-staging node scripts/migrate.js
   ```

4. **Set environment variables** (minimum required set):

   | Variable | Notes |
   |----------|-------|
   | `NODE_ENV` | `staging` |
   | `DATABASE_URL` | Auto-set by Railway PostgreSQL plugin |
   | `JWT_SECRET` | Generate: `openssl rand -hex 64` |
   | `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 64` |
   | `COOKIE_SECRET` | Generate: `openssl rand -hex 32` |
   | `STRIPE_SECRET_KEY` | Use Stripe **test** key (`sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | Stripe CLI or Stripe Dashboard (test endpoint) |
   | `RESEND_API_KEY` | Use Resend test key or real key with staging domain |
   | `ALLOWED_ORIGINS` | `https://staging.mydd.work` |
   | `FRONTEND_URL` | `https://staging.mydd.work` |
   | `REDIS_URL` | Optional — in-memory fallback if unset |
   | `DEEPL_API_KEY` | Optional — `/api/translate` returns 503 if unset |
   | `SENTRY_DSN` | Optional — errors not tracked if unset |

5. **Verify** the `/status` page once deployed:
   ```
   curl https://api-staging.mydd.work/status
   ```
   All critical services (PostgreSQL, Stripe, Resend) should show ✓ Operational.

---

## GitHub CI Gate (`staging-health`)

The `staging-health` job in `.github/workflows/staging.yml` runs only on pushes to
`staging` (not on PRs) and only when `STAGING_API_URL` is set.

### Activating the gate

1. Go to **GitHub → Repository → Settings → Variables → Actions**
2. Click **New repository variable**
3. Name: `STAGING_API_URL`
4. Value: `https://api-staging.mydd.work`
5. Save

Once set, every push to `staging` will:
- Wait 120 s for Railway to deploy
- Hit `/api/health` and assert `status === 'ok'`
- Hit `/api/health/ready` and assert `ready === true` and `db === 'ok'`
- Hit `POST /api/auth/login` and assert HTTP 400 or 401

Failure of the `staging-health` job blocks the branch from being merged to `main`
(configure this in **Settings → Branch protection rules → Require status checks**).

### Branch protection recommendation

Add these required status checks on `main`:
- `unit-tests`
- `lint`
- `frontend-tests`
- `e2e-tests`
- `staging-health` *(activate once `STAGING_API_URL` is set)*

---

## Stripe Webhook for Staging

Register a separate webhook endpoint in the Stripe Dashboard for the staging URL:

- Endpoint URL: `https://api-staging.mydd.work/api/payments/webhook`
- Events to subscribe (minimum):
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in Railway.

---

## Test Clock Workflow (local only)

Use the bundled script to simulate subscription renewals without waiting real time:

```bash
# Prerequisites: STRIPE_SECRET_KEY set to sk_test_* key, Stripe CLI installed
stripe listen --forward-to localhost:4000/api/payments/webhook &

# Full subscription lifecycle in one command:
node backend/scripts/stripe-test-clock.js full-cycle

# Or step by step:
node backend/scripts/stripe-test-clock.js create
node backend/scripts/stripe-test-clock.js advance <clock_id>
node backend/scripts/stripe-test-clock.js delete <clock_id>
```

---

## Smoke Test Checklist (after each staging deploy)

- [ ] `/status` shows all green
- [ ] `/api/health/ready` returns `{ ready: true, db: "ok" }`
- [ ] Can register a new company account
- [ ] Can log in with an existing account
- [ ] Stripe test checkout completes (use card `4242 4242 4242 4242`)
- [ ] Webhook processes the checkout and updates `certification_level` in DB
- [ ] `/api/registry` returns the certified company
- [ ] Admin panel at `/admin` shows correct stats
