/**
 * Tests for the Landing page (rewritten for the new non-i18next version).
 *
 * The page:
 *  - Renders real bilingual content (FR default) from the COPY constant
 *  - Fires `fetch('/api/registry?limit=1')` on mount to load certifiedCount
 *  - Shows the cert count stat block only once certCount is non-null
 *  - Has no /login link (nav only has /registry, /register)
 *  - Bronze / Silver / Gold each appear twice (badge pill + level card heading)
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, style, 'aria-label': ariaLabel }) => (
    <a href={to} style={style} aria-label={ariaLabel}>{children}</a>
  ),
}))

// No i18next mock needed — Landing no longer uses useTranslation

import Landing from '../pages/Landing'

// Helper: mock the global fetch used by Landing to preload certifiedCount
function mockFetch(total) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ pagination: { total } }),
  })
}

function mockFetchError() {
  global.fetch = vi.fn().mockRejectedValueOnce(new Error('network'))
}

describe('Landing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders hero h1 heading', async () => {
    mockFetch(42)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(
      screen.getByText('Vérification commerciale structurée pour le commerce international')
    ).toBeInTheDocument()
  })

  it('renders hero eyebrow label', async () => {
    mockFetch(42)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(
      screen.getByText('Plateforme privée de vérification commerciale')
    ).toBeInTheDocument()
  })

  it('shows certified count after fetch resolves', async () => {
    mockFetch(128)
    render(<Landing />)
    // Wait for the stat block to appear (rendered only when certCount !== null).
    // Use getAllByText to avoid throwing when the value appears in multiple nodes,
    // and anchor on the label so we know the whole block is present.
    await waitFor(() => {
      expect(screen.getByText('Entreprises vérifiées')).toBeInTheDocument()
    })
    expect(screen.getAllByText('128').length).toBeGreaterThanOrEqual(1)
  })

  it('hides certified count stat block while fetch is pending', () => {
    // Never resolve — certCount stays null → stat block not rendered
    global.fetch = vi.fn().mockReturnValueOnce(new Promise(() => {}))
    render(<Landing />)
    // Stat block is conditionally rendered only when certCount !== null
    expect(screen.queryByText('Entreprises vérifiées')).not.toBeInTheDocument()
  })

  it('hides certified count stat block when fetch errors', async () => {
    mockFetchError()
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // Error path: certCount stays null → stat block absent
    expect(screen.queryByText('Entreprises vérifiées')).not.toBeInTheDocument()
  })

  it('has a nav link to /registry', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(document.querySelector('a[href="/registry"]')).toBeInTheDocument()
  })

  it('does NOT have a nav link to /login (auth lives at /register)', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(document.querySelector('a[href="/login"]')).not.toBeInTheDocument()
  })

  it('has a link to /register', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument()
  })

  it('renders all three level names (Bronze / Silver / Gold appear at least once each)', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // Each label appears twice (badge pill + level card heading) — use getAllByText
    expect(screen.getAllByText('Bronze').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Silver').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Gold').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the process section heading', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(
      screen.getByText('Un processus simple, des livrables plus lisibles.')
    ).toBeInTheDocument()
  })
})
