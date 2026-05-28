// helpers.js — shared utilities for MyDD Playwright E2E tests.
//
// ── TESTING RULES (read before writing a new spec) ───────────────────────────
//
// RULE 1 — ROUTE ORDERING (LIFO: last registered wins)
//   Playwright gives priority to the LAST registered route that matches a URL.
//   Register broad globs FIRST so that specific routes registered LATER take
//   precedence. Registering the specific route first means the broad route
//   (registered afterwards) shadows it.
//
//   CORRECT — broad first, specific last (LIFO makes specific win):
//     await page.route(broad,    listHandler)
//     await page.route(specific, resolveHandler)  // <-- wins because registered last
//
//   WRONG — specific first, broad last (broad shadows specific):
//     await page.route(specific, resolveHandler)
//     await page.route(broad,    listHandler)     // <-- wins and intercepts resolve too
//
//   When stubApi() (beforeEach) already registers a broad stub, add your
//   specific override AFTER stubApi() so it has higher LIFO priority.
//
// RULE 2 — MULTI-STEP MODAL FLOWS
//   Buttons that open modals do NOT call the API. The API fires only when the
//   confirm button inside the modal is clicked. Assert only after all steps.
//
//   CORRECT:
//     await resolveBtn.click()    // opens modal — no API call yet
//     await confirmBtn.click()    // fires PATCH /api/.../resolve
//     expect(resolveCalled).toBe(true)
//
//   WRONG — confirm step missing, API is never called:
//     await resolveBtn.click()
//     expect(resolveCalled).toBe(true)  // always false
//
// RULE 3 — I18N BADGE TEXT
//   The app renders in the browser default locale (EN). Hardcoded French
//   strings fail when the locale resolves to English.
//
//   CORRECT — locale-aware regex:  /Paid|Paye/i   /Pending|En attente/i
//   WRONG   — French-only:         /Paye/i         /En attente/i
//
// ─────────────────────────────────────────────────────────────────────────────

/** sessionStorage key used by frontend/src/lib/session.js */
const SESSION_KEY = 'mydd_user'

/**
 * Inject a fake user session into sessionStorage so protected pages
 * skip the /api/auth/me call and render immediately.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} user - { id, name, email, role }
 */
async function seedSession(page, user) {
  await page.evaluate(
    ([key, value]) => sessionStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(user)],
  )
}

/**
 * Stub ALL /api/* requests so tests never hit a real backend.
 * Routes registered here act as the default; individual tests can
 * override specific paths by calling page.route() before navigation.
 *
 * @param {import('@playwright/test').Page} page
 */
async function stubApi(page) {
  // Catch-all registered FIRST so that every specific stub below (registered later)
  // takes precedence via Playwright's LIFO matching (last-registered wins).
  // Any /api/* URL not matched by a specific stub returns 404 "not mocked".
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not mocked' }) }),
  )

  // CSRF seed
  await page.route('**/api/auth/csrf-token', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  // Auth
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' } }),
    }),
  )
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) }),
  )
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'expired' }) }),
  )

  // Companies
  await page.route('**/api/companies/me', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        company: {
          id: 10, name: 'Acme Corp', companyName: 'Acme Corp',
          sector: 'Manufacturing', country: 'FR',
          status: 'active', certificationLevel: 2,
        },
        user: { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' },
      }),
    }),
  )

  // Registry (public) — field names match PublicRegistry.jsx: c.name, c.level
  await page.route('**/api/registry**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, name: 'Acme Corp', sector: 'Manufacturing', country: 'FR', level: 2 },
          { id: 11, name: 'Beta Ltd',  sector: 'Logistics',     country: 'DE', level: 1 },
        ],
        pagination: { page: 1, limit: 20, total: 2, pages: 1 },
      }),
    }),
  )

  // Verify — field names match Verify.jsx: data.level, data.status, data.badge (flat, not nested)
  await page.route('**/api/verify/**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR',
        level: 2, status: 'active', badge: 'Level 2 — KYC Validated',
        grantedAt: '2025-01-01T00:00:00Z',
        expiresAt: '2026-01-01T00:00:00Z',
        daysLeft: 200, expiringSoon: false, expired: false,
      }),
    }),
  )

  // Admin stats — field names match AdminPanel.jsx: stats.users.total, stats.companies.total
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        users:     { total: 42, last_30d: 5 },
        companies: { total: 18, certified: 15 },
        revenue:   { total_usd: 0 },
      }),
    }),
  )
  // Admin companies — field names match AdminPanel.jsx: c.company_name || c.name, c.certification_level
  await page.route('**/api/admin/companies**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, company_name: 'Acme Corp', sector: 'Manufacturing', country: 'FR', certification_level: 2, status: 'active' },
        ],
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      }),
    }),
  )
  await page.route('**/api/admin/users**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' },
        ],
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      }),
    }),
  )
  await page.route('**/api/admin/missions**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      }),
    }),
  )

  // PAC earnings
  await page.route('**/api/pac/earnings', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        summary: {
          totalEarnedCents: 5000, totalEarnedUsd: 50.00,
          pendingCents: 7500, pendingUsd: 75.00,
          commissionRate: 0.10, commissionPct: 10, pacTier: 'S1',
          completedCount: 3, paidCount: 1,
        },
        missions: [
          { id: 42, companyName: 'Acme Corp', location: 'Paris, FR', type: 'site_inspection',
            feeUsd: 500, commissionCents: 5000, commissionUsd: 50.00,
            paymentConfirmedAt: '2026-05-01T10:00:00Z', status: 'completed',
            outcome: 'pass', completedAt: '2026-04-30T00:00:00Z', createdAt: '2026-04-01T00:00:00Z' },
          { id: 43, companyName: 'Beta Ltd', location: 'Lyon, FR', type: 'site_inspection',
            feeUsd: 500, commissionCents: 5000, commissionUsd: 50.00,
            paymentConfirmedAt: null, status: 'completed',
            outcome: 'pass', completedAt: '2026-05-10T00:00:00Z', createdAt: '2026-04-15T00:00:00Z' },
        ],
      }),
    }),
  )

  // Payments
  await page.route('**/api/payments/create-checkout-session', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/test-session' }),
    }),
  )
  await page.route('**/api/payments/portal', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: 'https://billing.stripe.com/test-portal' }),
    }),
  )
  await page.route('**/api/payments/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ plan: 'level2', nextBillingDate: '2026-06-01', status: 'active' }),
    }),
  )
  // Mission fee checkout — returns a safe redirect URL (stays in test runner)
  await page.route('**/api/payments/mission-checkout', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: '/login?stripe-mission-redirect=1' }),
    }),
  )

  // Company missions (audits tab) — one unpaid + one paid mission
  await page.route('**/api/companies/missions**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        missions: [
          {
            id: 42, company_name: 'Acme Corp', location: 'Paris, FR',
            type: 'site_inspection', status: 'assigned', outcome: null,
            feeUsd: 500, paymentConfirmedAt: null,
            createdAt: '2026-04-01T00:00:00Z', completedAt: null,
          },
          {
            id: 43, company_name: 'Acme Corp', location: 'Lyon, FR',
            type: 'document_check', status: 'completed', outcome: 'pass',
            feeUsd: 300, paymentConfirmedAt: '2026-05-10T00:00:00Z',
            createdAt: '2026-04-10T00:00:00Z', completedAt: '2026-05-09T00:00:00Z',
          },
        ],
      }),
    }),
  )

  // Admin disputes — empty by default
  await page.route('**/api/admin/disputes**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      }),
    }),
  )

  // API keys (Developer tab)
  await page.route('**/api/keys', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({
          id: 99, prefix: 'mydd_test', name: 'My CI Key',
          key: 'mydd_test_abcdef1234567890abcdef1234567890',
          createdAt: new Date().toISOString(),
        }),
      })
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 1, prefix: 'mydd_live', name: 'Production', lastUsed: '2026-05-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
          { id: 2, prefix: 'mydd_test', name: 'Staging',    lastUsed: null,                  createdAt: '2026-02-01T00:00:00Z' },
        ],
      }),
    })
  })
  await page.route('**/api/keys/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )

  // Webhooks (Developer tab)
  await page.route('**/api/webhooks', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({
          id: 77, url: 'https://example.com/webhook',
          events: ['cert.status_changed'], description: '',
          secret: 'whsec_testsecret1234567890',
          createdAt: new Date().toISOString(),
        }),
      })
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, url: 'https://hooks.example.com/mydd', events: ['cert.status_changed', 'cert.issued'],
            description: 'Prod hook', active: true, createdAt: '2026-03-01T00:00:00Z' },
        ],
      }),
    })
  })
  // LIFO: register broad DELETE handler FIRST, then specific ping handler LAST
  // so ping wins over the catch-all for /api/webhooks/:id/ping URLs.
  await page.route('**/api/webhooks/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route('**/api/webhooks/*/ping', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, statusCode: 200 }),
    }),
  )

  // PAC public directory + agent profile (/agents, /agents/:id)
  // NOTE: PACDirectory.jsx calls agent.languages.split(',') — must be comma-separated string.
  // Single route handler inspects the URL to differentiate list vs. profile:
  //   /api/pac/directory            → list (with optional query string)
  //   /api/pac/directory/<number>   → individual profile
  await page.route('**/api/pac/directory**', (route) => {
    const url = route.request().url()
    if (/\/api\/pac\/directory\/\d+/.test(url)) {
      // Individual agent profile — missionHistory MUST be an array (not undefined)
      // because PACAgentProfile.jsx calls setHistory(res.data.missionHistory) and then
      // renders history.length, which crashes if undefined.
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          agent: { id: 5, name: 'Sophie Diallo', country: 'SN', languages: 'FR,EN', specialties: 'Manufacturing,Agribusiness', missionsCompleted: 32, bio: 'Expert in West African supply chains.', active: true, memberSince: '2025-03-01T00:00:00Z' },
          missionHistory: [],
        }),
      })
    }
    // Agent list (may include query string for search/pagination/tier filter)
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        agents: [
          { id: 5, name: 'Sophie Diallo', country: 'SN', languages: 'FR,EN', specialties: 'Manufacturing,Agribusiness', missionsCompleted: 32, bio: 'Expert in West African supply chains.', active: true },
          { id: 6, name: 'James Okafor',  country: 'NG', languages: 'EN',    specialties: 'Logistics,Trade Finance',    missionsCompleted: 18, bio: 'Former customs inspector.',              active: true },
        ],
        pagination: { total: 2, page: 1, limit: 20, pages: 1 },
      }),
    })
  })

  // Trader — watchlist (for trader.spec.js) + stats
  await page.route('**/api/trader/watchlist**', (route) => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 204, body: '' })
    }
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, name: 'Acme Corp', sector: 'Manufacturing', country: 'FR', level: 2 },
        ],
      }),
    })
  })
  await page.route('**/api/trader/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalVerified: 120, certifiedInSector: 18, avgLevel: 1.8 }),
    }),
  )

  // Notifications (Dashboard tab)
  // NotificationsPanel reads: r.data.notifications + r.data.unread
  // mark-one: PATCH /api/notifications/:id/read
  // mark-all: PATCH /api/notifications/read-all
  await page.route('**/api/notifications**', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ updated: 2 }),
      })
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        notifications: [
          { id: 1, type: 'cert_approved',   title: 'Certification approved',        body: 'Your Level 1 certification was approved.',         read: false, createdAt: '2026-05-20T10:00:00Z' },
          { id: 2, type: 'mission_assigned', title: 'PAC agent assigned',            body: 'A PAC agent has been assigned to your mission.',    read: false, createdAt: '2026-05-18T09:00:00Z' },
          { id: 3, type: 'cert_expiring',    title: 'Certification expiring soon',   body: 'Your certification expires in 30 days.',            read: true,  createdAt: '2026-05-10T08:00:00Z' },
        ],
        unread: 2,
      }),
    })
  })

}

module.exports = { seedSession, stubApi }
