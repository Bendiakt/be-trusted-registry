/**
 * pac.spec.js — E2E tests for the PAC Agent Portal.
 *
 * Scenarios:
 *  1. Access control — pac role loads portal, wrong roles redirect
 *  2. Missions tab — shows mission stats (active / available / completed counts)
 *  3. Missions tab — lists available missions
 *  4. Missions tab — accept a mission triggers POST
 *  5. Missions tab — submit a report triggers POST
 *  6. Profile tab — loads and saves profile
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

// ── PAC API stubs ─────────────────────────────────────────────────────────────

async function stubPacApi(page) {
  await stubApi(page)

  // Profile
  await page.route('**/api/pac/profile', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          name: 'Alice PAC', location: 'Paris, France',
          languages: 'French, English', certifications: 'ISO 9001',
          bio: 'Experienced auditor.',
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  // Missions list — backend returns a bare array (not wrapped in { data: [] })
  await page.route('**/api/pac/missions', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, company_name: 'Acme Corp', location: 'Paris', type: 'on_site',
          fee: 500, status: 'available', description: 'ISO 14001 audit' },
        { id: 2, company_name: 'Beta Ltd',  location: 'Lyon',  type: 'on_site',
          fee: 750, status: 'assigned',  description: 'AML compliance review' },
        { id: 3, company_name: 'Gamma Inc', location: 'Nice',  type: 'on_site',
          fee: 600, status: 'completed', description: 'Quality audit',
          completedAt: '2025-03-01T00:00:00Z' },
      ]),
    })
  )

  // Accept mission
  await page.route('**/api/pac/missions/*/accept', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )

  // Complete / submit report
  await page.route('**/api/pac/missions/*/complete', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )
}

const PAC_USER = { id: 5, name: 'Alice PAC', email: 'alice@pac.com', role: 'pac' }

// ── Access control ────────────────────────────────────────────────────────────

test.describe('PAC — access control', () => {
  test('pac-role user loads portal', async ({ page }) => {
    // 90s: this is the FIRST test — it triggers cold Vite compilation for BOTH
    // the login page AND PACPortal.jsx (two sequential cold navigations each up to 25s).
    // seedSession now uses addInitScript so session survives any Vite HMR hot-reload.
    test.setTimeout(90000)
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 6000 })
    // Nav label visible
    await expect(page.getByText(/PAC Agent Portal/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('company-role user is redirected from /pac to /dashboard', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Corp', email: 'corp@test.com', role: 'company' })
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })

  test('unauthenticated user is redirected from /pac to /login', async ({ page }) => {
    await stubApi(page)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })
})

// ── Missions tab ──────────────────────────────────────────────────────────────

test.describe('PAC — missions tab', () => {
  test.beforeEach(async ({ page }) => {
    // 45s: 2 navigations + cold Vite compile can consume up to 20s; need headroom for teardown
    test.setTimeout(45000)
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 6000 })
  })

  test('mission status counts are shown', async ({ page }) => {
    // stub: 1 assigned (active), 1 available, 1 completed
    await expect(page.getByText('1').first()).toBeVisible({ timeout: 5000 })
  })

  test('mission list renders company names', async ({ page }) => {
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Beta Ltd')).toBeVisible({ timeout: 5000 })
  })

  test('accepting a mission triggers POST and shows confirmation', async ({ page }) => {
    let acceptCalled = false
    await page.route('**/api/pac/missions/1/accept', (route) => {
      acceptCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    // Click the Accept button on mission 1
    const acceptBtn = page.getByRole('button', { name: /accept/i }).first()
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()

    // toPass() polls until the API route fires (click is async — don't assert synchronously)
    await expect(async () => { expect(acceptCalled).toBe(true) }).toPass({ timeout: 5000 })
    // Success message appears
    await expect(page.getByText(/Mission accepted!/i)).toBeVisible({ timeout: 5000 })
  })

  test('report form opens and submit triggers POST', async ({ page }) => {
    let completeCalled = false
    await page.route('**/api/pac/missions/*/complete', (route) => {
      completeCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    // Open the report form on assigned mission (Beta Ltd)
    const reportBtn = page.getByRole('button', { name: /submit report/i }).first()
    await expect(reportBtn).toBeVisible({ timeout: 5000 })
    await reportBtn.click()

    // Fill in report text
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 3000 })
    await textarea.fill('Detailed audit findings: all criteria met, documentation complete.')

    // Select outcome
    const outcomeSelect = page.locator('select').first()
    if (await outcomeSelect.isVisible()) await outcomeSelect.selectOption('pass')

    // Submit
    const submitBtn = page.getByRole('button', { name: /submit/i }).last()
    await submitBtn.click()

    // toPass() polls until the API route fires (click is async — don't assert synchronously)
    await expect(async () => { expect(completeCalled).toBe(true) }).toPass({ timeout: 5000 })
    await expect(page.getByText(/Report submitted successfully/i).first()).toBeVisible({ timeout: 5000 })
  })
})

// ── Profile tab ───────────────────────────────────────────────────────────────

test.describe('PAC — profile tab', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000)
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 6000 })
  })

  test('profile tab shows loaded profile data', async ({ page }) => {
    // Click the Profile tab
    const profileTab = page.getByRole('button', { name: /profile/i })
    await expect(profileTab).toBeVisible({ timeout: 5000 })
    await profileTab.click()

    // Profile data from stub should appear in the name input field
    await expect(page.locator('input').first()).toHaveValue('Alice PAC', { timeout: 5000 })
  })

  test('saving profile triggers PATCH and shows success', async ({ page }) => {
    let saveCalled = false
    await page.route('**/api/pac/profile', (route) => {
      if (route.request().method() !== 'GET') {
        saveCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ name: 'Alice PAC', location: 'Paris, France', languages: 'French', certifications: '', bio: '' }),
      })
    })

    const profileTab = page.getByRole('button', { name: /profile/i })
    await expect(profileTab).toBeVisible({ timeout: 5000 })
    await profileTab.click()

    // Save button
    const saveBtn = page.getByRole('button', { name: /save/i })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    await saveBtn.click()

    expect(saveCalled).toBe(true)
    await expect(page.getByText(/saved|success/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('PAC Portal — earnings tab', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000)
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 2, name: 'Jean Martin', email: 'jean@pac.com', role: 'pac' })
  })

  test('earnings tab is visible and shows summary stats', async ({ page }) => {
    await page.goto('/pac')

    const earningsTab = page.getByRole('button', { name: /revenu|earning/i }).first()
    await expect(earningsTab).toBeVisible({ timeout: 5000 })
    await earningsTab.click()

    // Summary stats from stub: $50 earned, $75 pending, 10% commission
    await expect(page.getByText('$50.00').first()).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('$75.00').first()).toBeVisible({ timeout: 4000 })
    await expect(page.getByText(/10%/).first()).toBeVisible({ timeout: 4000 })
  })

  test('earnings tab shows mission breakdown table with payment status', async ({ page }) => {
    await page.goto('/pac')

    const earningsTab = page.getByRole('button', { name: /revenu|earning/i }).first()
    await expect(earningsTab).toBeVisible({ timeout: 5000 })
    await earningsTab.click()

    // Acme Corp mission (paid)
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 6000 })
    // Beta Ltd mission (pending)
    await expect(page.getByText('Beta Ltd').first()).toBeVisible({ timeout: 4000 })
    // Paid badge — EN: "✓ Paid", FR: "✓ Payé" (i18n locale-aware)
    await expect(page.getByText(/✓.*(Paid|Payé)/i).first()).toBeVisible({ timeout: 4000 })
    // Pending badge — EN: "⏳ Pending", FR: "En attente"
    await expect(page.getByText(/Pending|En attente/i).first()).toBeVisible({ timeout: 4000 })
  })
})

// ── Progression tab (P10 — badge, tier, KYC status, achievement criteria) ────

test.describe('PAC — progression tab', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000)
    await stubPacApi(page)
    // Override progress endpoint to return achievement criteria
    await page.route('**/api/pac/progress', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          pac_tier: 'S1',
          target_tier: 'S2',
          progress_pct: 60,
          criteria: [
            { label: 'Missions complétées', value: 6, target: 10, format: 'number', met: false },
            { label: 'Taux de succès',      value: 1, target: 1,  format: 'boolean', met: true  },
          ],
        }),
      }),
    )
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 8000 })
  })

  test('progression tab is visible for S1 tier agent', async ({ page }) => {
    // The Progression tab renders for S1 (and S2) agents
    const progressionTab = page.getByRole('button', { name: /progression/i })
    await expect(progressionTab).toBeVisible({ timeout: 8000 })
  })

  test('progression tab shows current tier and KYC status', async ({ page }) => {
    await page.getByRole('button', { name: /progression/i }).click()

    // "Mon Statut PAC" section header
    await expect(page.getByText(/Mon Statut PAC/i)).toBeVisible({ timeout: 8000 })
    // Tier actuel = S1 (initial state — profile stub has no pac_tier so stays S1)
    await expect(page.getByText(/^S1$/).first()).toBeVisible({ timeout: 5000 })
    // KYC status defaults to "pending"
    await expect(page.getByText('pending')).toBeVisible({ timeout: 5000 })
  })

  test('progression tab shows achievement criteria from /api/pac/progress', async ({ page }) => {
    await page.getByRole('button', { name: /progression/i }).click()

    // Criteria section: "Critères — vers S2" + 60% progress
    await expect(page.getByText(/Critères.*vers S2/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('60%')).toBeVisible({ timeout: 5000 })
    // First criterion label
    await expect(page.getByText('Missions complétées').first()).toBeVisible({ timeout: 5000 })
  })
})

// ── Supervision tab (P16 — PACSupervisionDashboard) ───────────────────────────

// Fixture: one S1 agent under supervision
const TEAM_FIXTURE = {
  team: [
    {
      supervision_id: 1,
      full_name: 'Jordan Lee',
      email: 'jordan@example.com',
      supervision_status: 'active',
      location: 'Dakar, SN',
      missions_completed_month: 3,
      gross_revenue_cents_month: 150000,
      missions_total: 12,
    },
  ],
  preview: {
    month: 'May 2026',
    gross_revenue_cents: 150000,
    commissions_cents: 7500,
    net_be_cents: 142500,
    estimated_bonus_cents: 7125,
    active_supervised: 1,
  },
}

// Extended stub helper for S2 supervision scenarios
async function stubSupervisionApi(page) {
  await stubPacApi(page)

  // Override profile stub to include pac_tier: 'S2' — PACPortal.jsx calls setPacTier from
  // the profile response (api.get('/api/pac/profile') → res.data.pac_tier), NOT from progress.
  // Registered after stubPacApi so LIFO gives this route higher priority.
  await page.route('**/api/pac/profile', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          name: 'Alice PAC', location: 'Paris, France',
          languages: 'French, English', certifications: 'ISO 9001',
          bio: 'Experienced auditor.',
          pac_tier: 'S2',  // triggers setPacTier → supervision tab becomes visible
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  // Supervision endpoints
  await page.route('**/api/pac/supervision/team', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(TEAM_FIXTURE),
    }),
  )
  await page.route('**/api/pac/supervision/tasks', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        tasks: [],
        task_templates: ['monthly_report', 'team_check_in'],
        summary: { completion_rate: 0, completed: 0, total: 2 },
      }),
    }),
  )
  await page.route('**/api/pac/supervision/bonus', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ total_paid_usd: '50.00', history: [] }),
    }),
  )
  await page.route('**/api/pac/supervision/simulator', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        inputs: { missions_per_agent_month: 4, avg_fee_usd: 500 },
        monthly: { estimated_bonus_usd: '25.00' },
        annual: { estimated_bonus_usd: '300.00' },
      }),
    }),
  )
  // POST /api/pac/supervise — add supervised agent
  await page.route('**/api/pac/supervise', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }),
  )
}

test.describe('PAC — supervision tab (S2)', () => {
  test.beforeEach(async ({ page }) => {
    // 45s: cold Vite compilation of PACPortal.jsx can take 20-25s; need headroom for teardown
    test.setTimeout(45000)
    await stubSupervisionApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
  })

  test('supervision tab is visible for S2 tier agent', async ({ page }) => {
    await page.goto('/pac')
    // The tab label for S2 is "Supervision S2"
    const supervisionTab = page.getByRole('button', { name: /Supervision S2/i })
    await expect(supervisionTab).toBeVisible({ timeout: 8000 })
  })

  test('supervision tab shows KPI cards after load', async ({ page }) => {
    await page.goto('/pac')
    const supervisionTab = page.getByRole('button', { name: /Supervision S2/i })
    await supervisionTab.click()

    // KPI labels are always visible regardless of data
    await expect(page.getByText(/S1 actifs/i)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/Bonus estimé ce mois/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Total reçu/i)).toBeVisible({ timeout: 5000 })
  })

  test('supervision tab shows supervised team agent', async ({ page }) => {
    await page.goto('/pac')
    await page.getByRole('button', { name: /Supervision S2/i }).click()

    // Team fixture has one agent: Jordan Lee
    await expect(page.getByText('Jordan Lee')).toBeVisible({ timeout: 8000 })
  })

  test('supervise form sends POST /api/pac/supervise with user id', async ({ page }) => {
    let postBody = null
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('/api/pac/supervise')) {
        try { postBody = req.postDataJSON() } catch (_) {}
      }
    })

    await page.goto('/pac')
    await page.getByRole('button', { name: /Supervision S2/i }).click()

    // Fill the "User ID du S1 à encadrer" input
    const input = page.getByPlaceholder(/User ID du S1/i)
    await expect(input).toBeVisible({ timeout: 8000 })
    await input.fill('42')

    await page.getByRole('button', { name: /Envoyer demande/i }).click()

    await expect(async () => {
      expect(postBody).not.toBeNull()
      expect(postBody.supervised_user_id).toBe(42)
    }).toPass({ timeout: 5000 })
  })
})
