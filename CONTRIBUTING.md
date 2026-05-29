# Contributing to MyDD

Developer onboarding guide — how to set up the environment, run the test suites, add a feature, and get it merged.

---

## Local setup (5 minutes)

**Prerequisites:** Node.js ≥ 22, PostgreSQL 15+, Git.

```bash
git clone https://github.com/Bendiakt/be-registry.git
cd be-registry

# Install deps
cd backend && npm install
cd ../frontend && npm install
cd ../e2e && npm install

# Configure backend
cp backend/env.example backend/.env
# At minimum set: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY
# Run to generate secrets:
node -e "
const c = require('crypto')
console.log('JWT_SECRET=' + c.randomBytes(64).toString('hex'))
console.log('JWT_REFRESH_SECRET=' + c.randomBytes(64).toString('hex'))
console.log('ENCRYPTION_KEY=' + c.randomBytes(32).toString('hex'))
"

# Run migrations (idempotent)
cd backend && npm run migrate

# Start dev servers (two terminals)
cd backend && npm run dev        # port 5000
cd frontend && npm run dev       # port 5173
```

---

## Running tests

### Frontend (Vitest — 331 tests, 27 files)

```bash
cd frontend
npm test              # watch mode
npm test -- --run     # single run (CI mode)
```

The i18n parity test (`src/__tests__/i18n-parity.test.js`) enforces that all 6 locale files have identical key sets. Adding a key to `en.json` without updating the other 5 locales will block CI.

### Backend (Node --test)

```bash
cd backend
npm test
# Or run individual suites:
node --test tests/unit.test.js
node --test tests/lib.test.js
```

### E2E (Playwright)

```bash
cd e2e
npx playwright install --with-deps chromium   # first time only
npx playwright test
npx playwright test tests/company.spec.js     # single file
npx playwright show-trace test-results/<dir>/trace.zip  # debug a failure
```

All API calls are stubbed in `helpers.js` — no backend needed. Note the **LIFO rule**: register broad stubs first, specific overrides last.

---

## Architecture decisions

### Auth

- JWTs with access + refresh token pair. Session persisted in `sessionStorage` (`mydd_user` key) — survives page reload, cleared on tab close.
- Company onboarding completion flag stored in `localStorage` (`mydd_onboarding_done`).

### i18n

- `react-i18next` with JSON locale files in `frontend/src/locales/`.
- **Never hardcode UI strings** in page components — use `t('namespace.key')`.
- The CI parity test will fail if any locale file diverges.
- Locale files: `en`, `fr`, `es`, `pt`, `ar`, `zh`.

### API stubs in tests

- **Vitest**: mock `../lib/api` with `vi.mock`. Provide a `mockT()` helper that maps translation keys → English values (see `Onboarding.test.jsx` for the pattern).
- **Playwright**: use `page.route('**/api/endpoint', ...)`. LIFO order applies — the last registered route wins. Register broad catch-alls in `stubApi()` first, then add specific overrides.

### State management

No Redux / Zustand. Component state + `api.js` (axios wrapper) + session helpers. Trader compare uses a `compareMap { [id]: company }` (not `Set<id>`) so company data survives pagination.

---

## Adding a feature — checklist

- [ ] Create a branch: `git checkout -b feat/my-feature`
- [ ] Add backend route if needed → add route to `server.js` → add migration if schema changes
- [ ] Add frontend page/component
- [ ] **i18n**: add all new UI strings to `en.json` (and the other 5 locales). Run `npm test -- --run src/__tests__/i18n-parity.test.js` to verify.
- [ ] **Vitest**: add unit tests for the new page/component (`src/__tests__/`)
- [ ] **Playwright**: add E2E tests if the flow involves navigation or form submission (`e2e/tests/`)
- [ ] Open a PR → CI must be green before merge

---

## Branch & PR conventions

- Branch: `feat/<name>`, `fix/<name>`, `test/<name>`, `docs/<name>`
- Commit format: `feat(scope): description` / `fix(scope): description`
- PRs require CI green (all 5 jobs) — no exceptions
- Squash merge to main

---

## Deployment

- **Production**: every push to `main` auto-deploys to Railway
- Migrations run automatically as `preDeployCommand = "npm run migrate"` before the new server starts
- See `docs/railway-staging-setup.md` for staging environment setup

---

## Key files reference

| File | Purpose |
|------|---------|
| `backend/lib/auth.js` | JWT issue / verify / refresh |
| `backend/lib/audit.js` | Immutable audit log (HMAC-SHA256 chain) |
| `backend/lib/fraud.js` | 27-indicator trust score |
| `backend/lib/mailer.js` | Transactional email (Resend) |
| `frontend/src/lib/api.js` | Axios instance with token refresh interceptor |
| `frontend/src/lib/session.js` | `getSession` / `setSession` / `clearSession` |
| `frontend/src/locales/en.json` | Source of truth for all i18n keys |
| `e2e/helpers.js` | `seedSession`, `stubApi` — shared E2E utilities |
