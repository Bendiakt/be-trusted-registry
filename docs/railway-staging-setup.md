# Railway Staging Environment Setup

This document describes how to provision a complete staging environment
(backend + frontend) on Railway and wire it to the existing CI pipeline.

---

## 1. Create the staging services on Railway

### 1a. Backend staging service

1. Open **Railway Dashboard → New Service → GitHub Repo**
2. Select `Bendiakt/be-trusted-registry`, branch `staging`
3. **Root directory**: `backend`
4. **Start command**: `node server.js`
5. **Pre-deploy command**: `npm run migrate`
6. **Health check path**: `/api/health`

Set the following environment variables (values for staging, not production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL staging service URL |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | `sk_test_...` (Stripe test key) |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook dashboard (test mode) |
| `FRONTEND_URL` | `https://staging.mydd.work` (or Railway provided URL) |
| `CORS_ORIGINS` | `https://staging.mydd.work,https://frontend-staging-xxx.up.railway.app` |
| `NODE_ENV` | `production` |
| `ENCRYPTION_KEY` | Generate: `openssl rand -hex 32` |
| `RESEND_API_KEY` | Staging Resend key (or same key with test domain) |
| `REDIS_URL` | Railway Redis staging service URL |
| `SENTRY_DSN` | Staging Sentry project DSN (create new project in Sentry) |
| `METRICS_TOKEN` | Generate: `openssl rand -hex 16` |

### 1b. Frontend staging service

1. **New Service → GitHub Repo**, same repo, branch `staging`
2. **Root directory**: `frontend`
3. **Build command**: `npm run build`
4. **Start command**: `node -e "require('http').createServer((req,res)=>{res.end('ok')}).listen(process.env.PORT)"`
   → Actually Railway auto-detects Vite static output and serves it.
5. Set env var: `VITE_API_URL` = Railway backend staging URL

### 1c. PostgreSQL & Redis (staging)

Create two new Railway services:
- **PostgreSQL** → gives you `DATABASE_URL`
- **Redis** → gives you `REDIS_URL`

---

## 2. Activate the CI health probe

Once the staging backend is deployed, add the GitHub repository variable:

1. Go to **GitHub → Settings → Variables → Actions → New repository variable**
2. Name: `STAGING_API_URL`
3. Value: `https://be-trusted-registry-staging.up.railway.app` (Railway-assigned URL)

From that point, every push to `staging` runs the full CI suite and ends
with a live health check against the deployed service.

---

## 3. Optional custom domain

Add `staging.mydd.work` (CNAME to Railway) in Namecheap → DNS.

```
staging.mydd.work  CNAME  <your-railway-subdomain>.up.railway.app
```

---

## 4. Stripe test webhook

Register a test Stripe webhook pointing to:
```
https://staging-api.mydd.work/api/payments/webhook
```

Events to subscribe: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`.

---

## 5. Checklist

```
□ Backend staging service deployed (branch: staging)
□ Frontend staging service deployed (branch: staging)
□ DATABASE_URL set → migrations run on each deploy
□ STRIPE_SECRET_KEY is sk_test_ (never sk_live_ on staging)
□ STAGING_API_URL variable set in GitHub → CI health probe active
□ SENTRY_DSN set (separate staging project)
□ /api/health returns 200 with "node":"v22.x.x"
□ Login flow works end-to-end against test database
```
