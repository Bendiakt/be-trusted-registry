# MyDD — Trusted Registry

**MyDD** is a B2B SaaS supplier certification platform. Companies get certified across 3 tiers (document review → full KYC → on-site PAC inspection), appear in the Trusted Registry, and issue a verifiable public badge to their buyers.

- **Production:** [mydd.work](https://mydd.work) · API [api.mydd.work](https://api.mydd.work)
- **API docs:** [api.mydd.work/api/docs](https://api.mydd.work/api/docs)
- **B2B integration guide:** [docs/api-integration.md](docs/api-integration.md)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  frontend/          Vite + React 18 + i18next (6 langs)  │
│  backend/           Node.js 22 + Express + PostgreSQL     │
│  e2e/               Playwright (Chromium)                 │
│  docs/              API integration guide                 │
└─────────────────────────────────────────────────────────┘
```

**Deployed on Railway** — two services (frontend static, backend Node), one PostgreSQL instance.

---

## Quick Start

### Prerequisites

- Node.js ≥ 22
- PostgreSQL 15+ (local or Railway)
- (Optional) Redis — used for rate limiting; server degrades gracefully without it

### 1. Clone and install

```bash
git clone https://github.com/Bendiakt/be-registry.git
cd be-registry

# Backend
cd backend && npm install

# Frontend (separate terminal)
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cp backend/env.example backend/.env
# Edit backend/.env — minimum required:
#   DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY
```

Generate secrets in one command:
```bash
node -e "
const c = require('crypto')
console.log('JWT_SECRET=' + c.randomBytes(64).toString('hex'))
console.log('JWT_REFRESH_SECRET=' + c.randomBytes(64).toString('hex'))
console.log('ENCRYPTION_KEY=' + c.randomBytes(32).toString('hex'))
"
```

### 3. Run database migrations

```bash
cd backend && npm run migrate
```

This is idempotent — safe to re-run. Migrations are in `backend/migrations/`.

### 4. Start development servers

```bash
# Terminal 1 — backend (port 5000)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Frontend: `http://localhost:5173` · Backend: `http://localhost:5000`

---

## Testing

### Backend unit tests

```bash
cd backend
node --test tests/unit.test.js
node --test tests/validators.test.js
node --test tests/lib.test.js
node --test tests/fraud.test.js
node --test tests/webhook.test.js
node --test tests/encryption.test.js
```

### Frontend unit tests (Vitest)

```bash
cd frontend && npm test
```

Includes i18n parity test — verifies all 6 locale files (EN/FR/ES/PT/AR/ZH) are in sync. 446 tests across 31 files.

### E2E tests (Playwright)

```bash
cd e2e && npm ci
npx playwright install --with-deps chromium
npx playwright test
```

102 tests covering auth, dashboard, onboarding, admin, PAC (portal + directory + agent profile + supervision), payments, public pages, sector pages, developer tab, notifications, and compare panel. All API calls are mocked — no running backend needed. Runs in CI on every push.

---

## Project Structure

```
backend/
  lib/             Core modules (auth, audit, fraud detection, webhooks…)
  routes/          Express routers (one file per resource)
  migrations/      Ordered SQL migrations (001_*.sql → 008_*.sql)
  tests/           Node --test unit tests (13 files)
  server.js        Entry point
  env.example      Environment variable documentation

frontend/
  src/
    pages/         Route-level components (Dashboard, Landing, Onboarding,
                   SectorPage, TraderPortal, Verify, CertPrint, PACDirectory…)
    components/    Shared UI components (ComparePanel, NotificationsPanel…)
    locales/       i18n JSON files (en, fr, es, pt, ar, zh) — 603 keys each
    __tests__/     Vitest tests (31 files, 446 tests)
  public/
    sw.js          Service worker (PWA — network-first + cache-first)
    offline.html   Branded offline fallback page

e2e/
  tests/           Playwright specs (102 tests — all API calls mocked)
  helpers.js       seedSession, stubApi helpers; LIFO route-stub rules

docs/
  api-integration.md      B2B integration guide (API keys, webhooks, HMAC)
  railway-staging-setup.md  Manual Railway staging checklist
```

---

## Key Features

| Feature | Details |
|---------|---------|
| **3-tier certification** | Bronze (doc review), Silver (full KYC), Gold (on-site PAC inspection) |
| **Public verification** | `/verify/:id` — buyers confirm supplier certification in seconds |
| **Onboarding wizard** | Guided 3-step company setup (profile → documents → level), skippable |
| **Sector pages** | SEO-optimised `/sectors/:slug` for Manufacturing, Logistics, Agribusiness, Technology, Trade Finance — schema.org structured data |
| **Trader compare** | Side-by-side comparison of up to 3 suppliers (ComparePanel modal) |
| **PWA** | Service worker with network-first/cache-first strategies, branded offline page |
| **API keys** | SHA-256 hashed, scoped, rate-limited — B2B integrations without user sessions |
| **Webhooks** | HMAC-SHA256 signed, retry with exp. back-off, `cert.status_changed` et al. |
| **GDPR** | Data export (Art. 20), right to erasure (Art. 17), PII retention cron |
| **i18n** | 6 languages (EN/FR/ES/PT/AR/ZH), 573 keys, CI parity test |
| **2FA** | TOTP (Google Authenticator / Authy) |
| **Fraud detection** | 27-indicator trust score, disposable email detection, IP multi-account |
| **PAC agent network** | Public directory + individual profiles; Level 3 missions assigned to certified agents |
| **PDF certificates** | pdfkit A4 cert with QR code; PAC mission report PDF |

---

## Environment Variables

See [`backend/env.example`](backend/env.example) for the full annotated list.

**Required to start:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token signing key (≥64 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing key (different from JWT_SECRET) |
| `ENCRYPTION_KEY` | Audit log integrity key (32-byte hex) |

**Optional but degrade functionality when absent:**

| Variable | Feature |
|----------|---------|
| `STRIPE_SECRET_KEY` | Payments |
| `RESEND_API_KEY` | Transactional email |
| `REDIS_URL` | Rate limiting (falls back to in-memory) |
| `SENTRY_DSN` | Error monitoring |
| `METRICS_TOKEN` | Bearer token protecting `/api/metrics` |

---

## CI/CD

Two GitHub Actions workflows:

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | Push/PR → `main` | Backend tests, lint, frontend tests, E2E, Railway config guard, prod health probe |
| `staging.yml` | Push/PR → `staging` | Same suite + staging health probe (active — `STAGING_API_URL` set) |

**Deploy:** every push to `main` auto-deploys to Railway (production + staging). Staging backend: `https://backend-staging-staging-a158.up.railway.app`. Migrations run via `NIXPACKS_START_CMD=npm run start:preprod` on each staging deploy.

---

## Roles

| Role | Portal | Description |
|------|--------|-------------|
| `company` | `/dashboard` | Gets certified, manages documents, issues API keys |
| `trader` | `/trader` | Searches certified suppliers, manages watchlist |
| `pac` | `/pac` | PAC agent — accepts and completes site inspection missions |
| `admin` | `/admin` | Platform operator — sets certification levels, manages users |

---

## B2B Integration

See **[docs/api-integration.md](docs/api-integration.md)** for:
- API key creation and scope reference
- Registry search and supplier verification endpoints
- Webhook setup with HMAC-SHA256 signature verification (Node.js + Python examples)
- Rate limits, retry policy, error reference
- SDK snippets

Interactive explorer: [api.mydd.work/api/docs](https://api.mydd.work/api/docs)

---

## License

Proprietary — © B&E Consult FZCO, Dubai Silicon Oasis, UAE. All rights reserved.
