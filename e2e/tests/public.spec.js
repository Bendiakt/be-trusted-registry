/**
 * public.spec.js — E2E public-facing pages (no auth required).
 *
 * Scenarios:
 *  1. Landing page loads with brand name
 *  2. Public registry shows company list from API
 *  3. Search in registry filters results
 *  4. Verify page shows company cert info by ID
 *  5. /privacy and /terms pages are reachable
 *  6. Sector pages — hero, companies, FAQ, other-sector links
 *  7. Unknown sector → redirect to /registry
 */
const { test, expect } = require('@playwright/test')
const { stubApi } = require('./helpers')

test.describe('Public — landing page', () => {
  test('landing page loads and shows brand name', async ({ page }) => {
    await stubApi(page)
    await page.goto('/')

    // Target the visible brand name in the header logo — skip the hidden
    // honeypot span (aria-hidden="true") that also contains "MyDD".
    // The header logo renders a <div> with text "MyDD" (not aria-hidden).
    await expect(
      page.locator('header').getByText(/MyDD/i).first()
    ).toBeVisible({ timeout: 6000 })
  })

  test('landing page has a link to the public registry', async ({ page }) => {
    await stubApi(page)
    await page.goto('/')

    // Nav link text is "Registre" (FR) / "Registry" (EN); match by href is more robust.
    const registryLink = page.locator('a[href="/registry"]').first()
    await expect(registryLink).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Public — supplier registry', () => {
  test('registry page shows company names from API', async ({ page }) => {
    await stubApi(page)
    await page.goto('/registry')

    // Stubs return "Acme Corp" and "Beta Ltd"
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('Beta Ltd')).toBeVisible({ timeout: 6000 })
  })

  test('registry page shows certification level badges', async ({ page }) => {
    await stubApi(page)
    await page.goto('/registry')

    // Level 2 (★) and Level 1 (◆) icons from LEVEL_ICONS in PublicRegistry.jsx
    await expect(page.getByText('★').first()).toBeVisible({ timeout: 6000 })
  })

  test('search input is present and functional', async ({ page }) => {
    await stubApi(page)

    // Override registry to reflect search query
    let lastUrl = ''
    await page.route('**/api/registry**', (route) => {
      lastUrl = route.request().url()
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR', certificationLevel: 2 }],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        }),
      })
    })

    await page.goto('/registry')

    const searchInput = page.locator('input[type="search"], input[type="text"], input[placeholder*="search" i], input[placeholder*="recherche" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('Acme')
    // Trigger search (press Enter or wait for debounce)
    await searchInput.press('Enter')
    await page.waitForTimeout(1200)

    // Search term should appear in the last API URL
    expect(decodeURIComponent(lastUrl)).toContain('Acme')
  })
})

test.describe('Public — certificate verify page', () => {
  test('verify page displays company name and cert info', async ({ page }) => {
    await stubApi(page)
    await page.goto('/verify/10')

    // Stub returns "Acme Corp" with level 2
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 6000 })
    // Some cert-level indicator
    await expect(page.getByText(/level 2|niveau 2|★|certified/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('verify page shows expiry information', async ({ page }) => {
    await stubApi(page)
    await page.goto('/verify/10')

    // Should display some date or "days left" indicator
    await expect(
      page.getByText(/2026|days|jour|valid/i).first()
    ).toBeVisible({ timeout: 6000 })
  })
})

test.describe('Public — legal pages', () => {
  test('/privacy page is reachable', async ({ page }) => {
    await stubApi(page)
    await page.goto('/privacy')

    await expect(page).toHaveURL(/\/privacy/)
    await expect(page.getByText(/privacy|confidentialité|données/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('/terms page is reachable', async ({ page }) => {
    await stubApi(page)
    await page.goto('/terms')

    await expect(page).toHaveURL(/\/terms/)
    await expect(page.getByText(/terms|conditions|cgu/i).first()).toBeVisible({ timeout: 5000 })
  })
})

// ── Sector pages ──────────────────────────────────────────────────────────────
test.describe('Public — sector pages', () => {
  // Stub the registry API to return two companies for sector queries
  async function stubSector(page) {
    await stubApi(page)
    await page.route('**/api/registry**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 20, name: 'Steel Works Ltd', level: 2, country: 'DE', sector: 'Manufacturing' },
            { id: 21, name: 'Iron & Co',       level: 1, country: 'FR', sector: 'Manufacturing' },
          ],
          pagination: { page: 1, limit: 12, total: 2, pages: 1 },
        }),
      }),
    )
  }

  test('manufacturing sector page loads with hero heading', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    await expect(page.getByRole('heading', { level: 1 }))
      .toContainText(/certified manufacturers/i, { timeout: 6000 })
  })

  test('sector page displays stat pills', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    await expect(page.getByText(/quality audit/i).first()).toBeVisible({ timeout: 6000 })
  })

  test('sector page shows certified companies from API', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    await expect(page.getByText('Steel Works Ltd')).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('Iron & Co')).toBeVisible({ timeout: 6000 })
  })

  test('company card links to /verify/:id', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    const link = page.locator('a[href="/verify/20"]')
    await expect(link).toBeVisible({ timeout: 6000 })
  })

  test('sector page renders FAQ questions', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    await expect(page.getByText(/why verify a manufacturer/i)).toBeVisible({ timeout: 6000 })
  })

  test('other-sector links are shown', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    // Other sectors section should show at least logistics
    await expect(page.getByRole('link', { name: /Logistics/i }).first()).toBeVisible({ timeout: 6000 })
  })

  test('breadcrumb contains sector name', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    // Breadcrumb nav contains "Manufacturing"
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]')
    await expect(breadcrumb).toContainText('Manufacturing', { timeout: 6000 })
  })

  test('document title is set to sector name', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    // Wait for dynamic title
    await page.waitForFunction(
      () => document.title.toLowerCase().includes('manufacturing'),
      { timeout: 6000 },
    )
    expect(await page.title()).toMatch(/manufacturing/i)
  })

  test('logistics sector page loads', async ({ page }) => {
    await stubApi(page)
    await page.route('**/api/registry**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { page: 1, limit: 12, total: 0, pages: 0 } }),
      }),
    )
    await page.goto('/sectors/logistics')

    await expect(page.getByRole('heading', { level: 1 }))
      .toContainText(/certified logistics/i, { timeout: 6000 })
  })

  test('unknown sector redirects to /registry', async ({ page }) => {
    await stubApi(page)
    await page.goto('/sectors/invalid-sector-xyz')

    await expect(page).toHaveURL(/\/registry/, { timeout: 6000 })
  })

  test('"View all results" link includes sector in query param', async ({ page }) => {
    await stubSector(page)
    await page.goto('/sectors/manufacturing')

    const viewAllLink = page.getByRole('link', { name: /view all results/i })
    await expect(viewAllLink).toBeVisible({ timeout: 6000 })
    const href = await viewAllLink.getAttribute('href')
    expect(href).toContain('/registry?sector=')
    expect(href).toContain('Manufacturing')
  })
})
