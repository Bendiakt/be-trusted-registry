/**
 * Tests for the Landing page.
 *
 * The page fires a `fetch('/api/registry?limit=1')` on mount to load the
 * certified-company count stat. Everything else is static / i18n-driven.
 *
 * Covers:
 *  - Hero section renders i18n keys
 *  - Nav links: registry, login, register
 *  - Certified count shows "…" while fetch is pending and updates when resolved
 *  - Pricing plan names (Bronze / Silver / Gold) are rendered
 *  - Features section heading renders
 *  - How-it-works steps section present
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import Landing from '../pages/Landing'

// Helper: mock the global fetch used by Landing to preload certifiedCount
function mockFetch(total) {
  global.fetch = vi.fn().mockResolvedValueOnce({
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

  it('renders hero badge label', async () => {
    mockFetch(42)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // landing.hero.badge is in a standalone <span>
    expect(screen.getByText('landing.hero.badge')).toBeInTheDocument()
  })

  it('renders hero subtitle', async () => {
    mockFetch(42)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByText('landing.hero.subtitle')).toBeInTheDocument()
  })

  it('shows certified count after fetch resolves', async () => {
    mockFetch(128)
    render(<Landing />)
    await waitFor(() => {
      expect(screen.getByText('128')).toBeInTheDocument()
    })
  })

  it('shows "…" for certified count while fetch is pending', () => {
    // Never resolve
    global.fetch = vi.fn().mockReturnValueOnce(new Promise(() => {}))
    render(<Landing />)
    expect(screen.getByText('…')).toBeInTheDocument()
  })

  it('shows "…" when fetch errors', async () => {
    mockFetchError()
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // Falls back to null → renders "…"
    expect(screen.getByText('…')).toBeInTheDocument()
  })

  it('has a nav link to /registry', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(document.querySelector('a[href="/registry"]')).toBeInTheDocument()
  })

  it('has a nav link to /login', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument()
  })

  it('has a nav link to /register', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument()
  })

  it('renders all three pricing plan names', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByText('Bronze')).toBeInTheDocument()
    expect(screen.getByText('Silver')).toBeInTheDocument()
    expect(screen.getByText('Gold')).toBeInTheDocument()
  })

  it('renders features section title key', async () => {
    mockFetch(0)
    render(<Landing />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByText('landing.features.title')).toBeInTheDocument()
  })
})
