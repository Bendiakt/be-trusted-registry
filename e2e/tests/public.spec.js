/**
 * public.spec.js — E2E public-facing pages (no auth required).
 *
 * Scenarios:
 *  1. Landing page loads with brand name
 *  2. Public registry shows company list from API
 *  3. Search in registry filters results
 *  4. Verify page shows company cert info by ID
 *  5. /privacy and /terms pages are reachable
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
