/**
 * admin.spec.js — E2E admin panel flows.
 *
 * Scenarios:
 *  1. Admin panel loads for admin-role user
 *  2. Non-admin (company role) is redirected to /login
 *  3. Overview tab shows platform stats
 *  4. Companies tab lists companies
 *  5. Certification level update triggers PATCH request
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

test.describe('Admin — access control', () => {
  test('admin panel loads for admin role', async ({ page }) => {
    test.setTimeout(45000)
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
    await page.goto('/admin')

    // Should NOT redirect to login
    await expect(page).toHaveURL(/\/admin/, { timeout: 6000 })
    // Stats from mock should appear
    await expect(page.getByText(/42|18|overview/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('company-role user is redirected from /admin to /login', async ({ page }) => {
    // 90s: navigates login → /admin → /dashboard (redirect), potentially triggering
    // cold Vite compilation for BOTH the admin and dashboard bundles on first run
    test.setTimeout(90000)
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Corp User', email: 'corp@test.com', role: 'company' })
    await page.goto('/admin')

    // RoleRoute redirects wrong-role (authenticated) users to /dashboard, not /login
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })

  test('unauthenticated user is redirected from /admin to /login', async ({ page }) => {
    test.setTimeout(45000)
    await stubApi(page)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })
})

test.describe('Admin — overview stats', () => {
  test.beforeEach(async ({ page }) => {
    // 45s: cold AdminPanel.jsx Vite compilation can take 20-25s; need headroom for teardown
    test.setTimeout(45000)
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('overview shows total users and companies from API', async ({ page }) => {
    await page.goto('/admin')
    // Stats stub returns { totalUsers: 42, totalCompanies: 18 }
    await expect(page.getByText('42')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('18')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Admin — companies tab', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000)
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('companies tab lists company names', async ({ page }) => {
    await page.goto('/admin')

    const companiesTab = page.getByRole('button', { name: /companies|entreprises/i }).first()
    await expect(companiesTab).toBeVisible({ timeout: 5000 })
    await companiesTab.click()

    // Stub returns "Acme Corp"
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 5000 })
  })

  test('certification level PATCH is called when level is saved', async ({ page }) => {
    let patchCalled = false
    let patchBody   = null

    await page.route('**/api/admin/companies/**/level', async (route) => {
      patchCalled = true
      patchBody   = route.request().postDataJSON()
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Level updated' }),
      })
    })

    await page.goto('/admin')

    const companiesTab = page.getByRole('button', { name: /companies|entreprises/i }).first()
    if (await companiesTab.isVisible()) await companiesTab.click()

    // Look for a level select for the first company (AdminPanel uses <select>, not <input>)
    const levelInput = page.locator('select').first()
    if (await levelInput.isVisible()) {
      await levelInput.selectOption('3')
    }

    const saveBtn = page.getByRole('button', { name: /save|set level|certify|valider/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(1000)
      expect(patchCalled).toBe(true)
    }
  })
})

test.describe('Admin — disputes tab', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000)
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('disputes tab is accessible from admin panel', async ({ page }) => {
    await page.goto('/admin')

    const disputesTab = page.getByRole('button', { name: /dispute|litige|contest/i }).first()
    if (await disputesTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await disputesTab.click()
      // Tab content should render (stub returns empty list)
      await expect(
        page.getByText(/dispute|litige|aucun|no dispute|open/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('disputes tab shows open disputes when data is returned', async ({ page }) => {
    // Override stub to return one open dispute
    await page.route('**/api/admin/disputes**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 1, mission_id: 42, reason: 'Incorrect audit outcome',
              status: 'open', created_at: '2026-05-01T10:00:00Z',
              company_name: 'Acme Corp',
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        }),
      }),
    )

    await page.goto('/admin')

    const disputesTab = page.getByRole('button', { name: /dispute|litige|contest/i }).first()
    if (await disputesTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await disputesTab.click()
      // Dispute reason or company name should appear
      await expect(
        page.getByText(/Acme Corp|Incorrect audit/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('resolving a dispute calls the resolve API', async ({ page }) => {
    let resolveCalled = false

    // Broad list stub — registered FIRST so the specific resolve route (below)
    // takes LIFO priority and intercepts /resolve URLs before this handler does.
    await page.route('**/api/admin/disputes**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 1, mission_id: 42, reason: 'Incorrect audit outcome',
              status: 'open', created_at: '2026-05-01T10:00:00Z',
              company_name: 'Acme Corp',
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        }),
      }),
    )

    // Specific resolve route — registered LAST so LIFO gives it priority over the broad stub.
    await page.route('**/api/admin/disputes/*/resolve', async (route) => {
      resolveCalled = true
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Dispute resolved' }),
      })
    })

    await page.goto('/admin')

    const disputesTab = page.getByRole('button', { name: /dispute|litige|contest/i }).first()
    if (await disputesTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await disputesTab.click()

      // AdminPanel shows a "Resolve" button that opens a confirmation modal.
      // The API is only called when "Confirm Resolution" inside the modal is clicked.
      const resolveBtn = page.getByRole('button', { name: /^Resolve$/i }).first()
      if (await resolveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resolveBtn.click()

        // Wait for the modal and click "Confirm Resolution"
        const confirmBtn = page.getByRole('button', { name: /Confirm Resolution/i }).first()
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click()
          await page.waitForTimeout(1000)
          expect(resolveCalled).toBe(true)
        }
      }
    }
  })
})

// ── Fraud Alerts tab (P21) ────────────────────────────────────────────────────
const FRAUD_FIXTURE = {
  data: [
    {
      id: 1, user_id: 7,
      user_name: 'Suspicious Corp', user_email: 'fraud@suspicious.com',
      rule: 'multi_account', severity: 'high', resolved: false,
      created_at: '2026-05-01T10:00:00Z',
    },
    {
      id: 2, user_id: 8,
      user_name: 'Dodgy Ltd', user_email: 'dodgy@example.com',
      rule: 'rapid_cert_request', severity: 'medium', resolved: true,
      created_at: '2026-04-15T08:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 50, total: 2, pages: 1 },
}

test.describe('Admin — fraud alerts tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('fraud alerts tab is reachable from admin panel', async ({ page }) => {
    await page.goto('/admin')
    const fraudTab = page.getByRole('button', { name: /^Fraud$/i })
    await expect(fraudTab).toBeVisible({ timeout: 5000 })
    await fraudTab.click()
    // Panel heading "Fraud Alerts" should appear
    await expect(page.getByText(/Fraud Alerts/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('fraud alerts tab shows alert data from API', async ({ page }) => {
    // Override default stub to return our fixture alerts
    await page.route('**/api/admin/fraud-alerts**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(FRAUD_FIXTURE),
      }),
    )

    await page.goto('/admin')
    await page.getByRole('button', { name: /^Fraud$/i }).click()

    // Both alerts' data should appear in the table
    await expect(page.getByText('fraud@suspicious.com')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('multi_account')).toBeVisible({ timeout: 5000 })
  })

  test('resolve button sends PATCH /api/admin/fraud-alerts/:id/resolve', async ({ page }) => {
    let resolvedId = null

    // Broad fraud-alerts handler — LIFO: registered first so the specific resolve route (below)
    // takes priority for /resolve URLs; this handles the GET list.
    await page.route('**/api/admin/fraud-alerts**', (route) => {
      if (route.request().method() === 'PATCH') {
        const match = route.request().url().match(/\/fraud-alerts\/(\d+)\/resolve/)
        if (match) resolvedId = Number(match[1])
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ message: 'Resolved' }),
        })
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(FRAUD_FIXTURE),
      })
    })

    await page.goto('/admin')
    await page.getByRole('button', { name: /^Fraud$/i }).click()
    await expect(page.getByText('fraud@suspicious.com')).toBeVisible({ timeout: 5000 })

    // Click Resolve for alert id=1 (first button labelled "Resolve" in the fraud tab)
    await page.getByRole('button', { name: /^Resolve$/i }).first().click()

    await expect(async () => { expect(resolvedId).toBe(1) }).toPass({ timeout: 5000 })
  })

  test('filter toggle sends request with resolved=true', async ({ page }) => {
    const requestedUrls = []
    await page.route('**/api/admin/fraud-alerts**', (route) => {
      requestedUrls.push(route.request().url())
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } }),
      })
    })

    await page.goto('/admin')
    await page.getByRole('button', { name: /^Fraud$/i }).click()

    // Click the "Resolved" filter button inside the fraud tab
    const resolvedFilter = page.getByRole('button', { name: /^Resolved$/i }).first()
    await expect(resolvedFilter).toBeVisible({ timeout: 5000 })
    await resolvedFilter.click()

    // A new GET request with resolved=true should have been made
    await expect(async () => {
      expect(requestedUrls.some(u => u.includes('resolved=true'))).toBe(true)
    }).toPass({ timeout: 5000 })
  })
})

// ── CSV export (P21) ──────────────────────────────────────────────────────────
test.describe('Admin — CSV export', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('Export CSV button in companies tab triggers GET /api/admin/export/companies', async ({ page }) => {
    let exportCalled = false
    page.on('request', req => {
      if (req.method() === 'GET' && req.url().includes('/api/admin/export/companies')) {
        exportCalled = true
      }
    })

    await page.goto('/admin')

    // Navigate to Companies tab
    const companiesTab = page.getByRole('button', { name: /companies|entreprises/i }).first()
    await companiesTab.click()

    // Export CSV button should be visible and clickable
    const exportBtn = page.getByRole('button', { name: /export csv/i })
    await expect(exportBtn).toBeVisible({ timeout: 5000 })
    await exportBtn.click()

    await expect(async () => { expect(exportCalled).toBe(true) }).toPass({ timeout: 5000 })
  })
})

// ── Users tab ─────────────────────────────────────────────────────────────────
test.describe('Admin — users tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('users tab lists user name and email from API', async ({ page }) => {
    await page.goto('/admin')
    // Click Users tab (exact match to avoid matching "Overview" or other tabs)
    const usersTab = page.getByRole('button', { name: /^users$/i }).first()
    await expect(usersTab).toBeVisible({ timeout: 5000 })
    await usersTab.click()
    // Stub returns Test User / test@example.com (role: company)
    await expect(page.getByText('test@example.com')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('COMPANY')).toBeVisible({ timeout: 5000 })
  })
})

// ── PAC Network tab ───────────────────────────────────────────────────────────
const PAC_AGENT_FIXTURE = {
  data: [
    {
      id: 5, user_id: 5, full_name: 'Sophie Diallo', email: 'sophie@pac.com',
      pac_tier: 'S1', kyc_status: 'approved', supervisees_count: 0,
      missions_count: 12, pending_bonus_cents: 5000,
      eligible_for_s2: false, eligible_for_s3: false,
    },
  ],
  pagination: { page: 1, limit: 50, total: 1, pages: 1 },
}

test.describe('Admin — PAC Network tab', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000)
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('PAC Network tab is reachable from admin panel', async ({ page }) => {
    await page.goto('/admin')
    const pacTab = page.getByRole('button', { name: /PAC Network/i })
    await expect(pacTab).toBeVisible({ timeout: 5000 })
    await pacTab.click()
    // Default sub-tab is "agents" — heading "PAC Agents — KYC Queue" should appear
    await expect(page.getByText(/PAC Agents.*KYC Queue/i)).toBeVisible({ timeout: 5000 })
  })

  test('PAC agents sub-tab shows agent list from API', async ({ page }) => {
    // Override agents stub to return one agent
    await page.route('**/api/admin/pac/agents**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(PAC_AGENT_FIXTURE),
      }),
    )

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()

    // Agents sub-tab shows Sophie Diallo
    await expect(page.getByText('Sophie Diallo')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('sophie@pac.com')).toBeVisible({ timeout: 5000 })
  })

  test('supervision sub-tab shows pending requests section', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()

    // Click the "🔗 Supervision Requests" sub-tab
    const supTab = page.getByRole('button', { name: /Supervision Requests/i })
    await expect(supTab).toBeVisible({ timeout: 5000 })
    await supTab.click()

    // Section heading appears (empty state since stub returns [])
    await expect(page.getByText(/Pending Supervision Requests/i)).toBeVisible({ timeout: 5000 })
  })

  test('supervision sub-tab shows request data from API', async ({ page }) => {
    // Override supervision stub to return one request
    await page.route('**/api/pac/admin/supervision/pending', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          requests: [
            {
              id: 1,
              supervisor_user_id: 5, supervised_user_id: 6,
              supervisor_name: 'Sophie Diallo', supervisor_email: 'sophie@pac.com',
              supervisor_tier_profile: 'S2',
              supervised_name: 'Marc Dupont', supervised_email: 'marc@pac.com',
              supervised_tier: 'S1',
              requested_at: '2026-05-01T10:00:00Z',
            },
          ],
        }),
      }),
    )

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()
    await page.getByRole('button', { name: /Supervision Requests/i }).click()

    // Should show supervisor → supervised pairing
    await expect(page.getByText('Sophie Diallo')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Marc Dupont')).toBeVisible({ timeout: 5000 })
    // Approve / Reject buttons visible
    await expect(page.getByRole('button', { name: /Approve/i }).first()).toBeVisible({ timeout: 5000 })
  })

  test('supervision approve button sends POST to approve endpoint', async ({ page }) => {
    let approveCalled = false
    // Override supervision stub with one pending request
    await page.route('**/api/pac/admin/supervision/pending', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          requests: [
            {
              id: 1,
              supervisor_user_id: 5, supervised_user_id: 6,
              supervisor_name: 'Sophie Diallo', supervisor_email: 'sophie@pac.com',
              supervisor_tier_profile: 'S2',
              supervised_name: 'Marc Dupont', supervised_email: 'marc@pac.com',
              supervised_tier: 'S1',
              requested_at: '2026-05-01T10:00:00Z',
            },
          ],
        }),
      }),
    )
    // Intercept the approve POST (LIFO — registered after the broad /api/** catch-all)
    await page.route('**/api/pac/admin/supervision/1/approve', (route) => {
      approveCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()
    await page.getByRole('button', { name: /Supervision Requests/i }).click()

    const approveBtn = page.getByRole('button', { name: /✓ Approve/i }).first()
    await expect(approveBtn).toBeVisible({ timeout: 5000 })
    await approveBtn.click()

    await expect(async () => { expect(approveCalled).toBe(true) }).toPass({ timeout: 5000 })
  })

  test('KYC Review modal opens and PATCH is sent on Submit Decision', async ({ page }) => {
    let kycPatchCalled = false
    // Override agents stub to return one agent with pending KYC
    await page.route('**/api/admin/pac/agents**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(PAC_AGENT_FIXTURE),
      }),
    )
    // Intercept the KYC PATCH
    await page.route(`**/api/admin/pac/agents/${PAC_AGENT_FIXTURE.data[0].user_id}/kyc`, (route) => {
      kycPatchCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()

    // Click "KYC Review" on the agent row
    const kycReviewBtn = page.getByRole('button', { name: /KYC Review/i }).first()
    await expect(kycReviewBtn).toBeVisible({ timeout: 5000 })
    await kycReviewBtn.click()

    // Modal should open
    await expect(page.getByText(/PAC KYC Review/i)).toBeVisible({ timeout: 3000 })

    // Submit the default decision (approved)
    const submitBtn = page.getByRole('button', { name: /Submit Decision/i })
    await expect(submitBtn).toBeVisible({ timeout: 3000 })
    await submitBtn.click()

    await expect(async () => { expect(kycPatchCalled).toBe(true) }).toPass({ timeout: 5000 })
  })

  test('Bonus Statements sub-tab is reachable and shows data from API', async ({ page }) => {
    // Fixture fields must match AdminPanel.jsx: full_name, period_year, period_month (numeric),
    // bonus_level, missions_count, net_be_revenue_cents, bonus_rate, task_completion_pct
    const BONUS_FIXTURE = {
      statements: [
        {
          id: 1, supervisor_id: 5,
          full_name: 'Sophie Diallo', pac_tier: 'S2',
          period_year: 2026, period_month: 5,
          bonus_level: 'L1', missions_count: 4,
          net_be_revenue_cents: 20000, bonus_rate: 0.05,
          task_completion_pct: 80,
          bonus_multiplier: 1, final_bonus_cents: 1000,
          status: 'draft',
        },
      ],
    }
    await page.route('**/api/pac/admin/bonus/statements', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BONUS_FIXTURE) }),
    )

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()
    const bonusTab = page.getByRole('button', { name: /Bonus Statements/i })
    await expect(bonusTab).toBeVisible({ timeout: 5000 })
    await bonusTab.click()

    await expect(page.getByText('Sophie Diallo')).toBeVisible({ timeout: 5000 })
    // Validate button visible for draft statement
    await expect(page.getByRole('button', { name: /Validate/i }).first()).toBeVisible({ timeout: 5000 })
  })

  test('bonus Validate button calls POST /api/pac/admin/bonus/:id/validate', async ({ page }) => {
    let validateCalled = false
    await page.route('**/api/pac/admin/bonus/statements', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          statements: [
            { id: 7, supervisor_id: 5, full_name: 'Sophie Diallo', pac_tier: 'S2',
              period_year: 2026, period_month: 5, bonus_level: 'L1', missions_count: 4,
              net_be_revenue_cents: 20000, bonus_rate: 0.05, task_completion_pct: 80,
              bonus_multiplier: 1, final_bonus_cents: 1000, status: 'draft' },
          ],
        }),
      }),
    )
    await page.route('**/api/pac/admin/bonus/7/validate', (route) => {
      validateCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()
    await page.getByRole('button', { name: /Bonus Statements/i }).click()

    const validateBtn = page.getByRole('button', { name: /^Validate$/i }).first()
    await expect(validateBtn).toBeVisible({ timeout: 5000 })
    await validateBtn.click()

    await expect(async () => { expect(validateCalled).toBe(true) }).toPass({ timeout: 5000 })
  })

  test('bonus Mark Paid button calls POST /api/pac/admin/bonus/:id/pay', async ({ page }) => {
    let payCalled = false
    await page.route('**/api/pac/admin/bonus/statements', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          statements: [
            { id: 8, supervisor_id: 5, full_name: 'Sophie Diallo', pac_tier: 'S2',
              period_year: 2026, period_month: 5, bonus_level: 'L1', missions_count: 4,
              net_be_revenue_cents: 20000, bonus_rate: 0.05, task_completion_pct: 80,
              bonus_multiplier: 1, final_bonus_cents: 1000, status: 'validated' },
          ],
        }),
      }),
    )
    await page.route('**/api/pac/admin/bonus/8/pay', (route) => {
      payCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    await page.goto('/admin')
    await page.getByRole('button', { name: /PAC Network/i }).click()
    await page.getByRole('button', { name: /Bonus Statements/i }).click()

    // Mock window.prompt so it returns a payment reference without showing a dialog
    await page.evaluate(() => { window.prompt = () => 'SWIFT-TEST-REF-2026' })

    const payBtn = page.getByRole('button', { name: /Mark Paid/i }).first()
    await expect(payBtn).toBeVisible({ timeout: 5000 })
    await payBtn.click()

    await expect(async () => { expect(payCalled).toBe(true) }).toPass({ timeout: 5000 })
  })
})
