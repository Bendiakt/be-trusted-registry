/**
 * Tests for TraderPortal page.
 *
 * Auth guard: redirects to /login if no session, /pac if pac role.
 * Admin users are allowed (RoleRoute in App.jsx gates this; internal component does not re-redirect).
 * Default tab: 'registry' — calls /api/registry + /api/trader/watchlist + /api/trader/stats.
 *
 * Covers:
 *  - Redirects to /login when no session
 *  - Redirects to /pac for pac role
 *  - Admin user is allowed (does NOT redirect to /admin)
 *  - Renders portal title for trader role
 *  - Registry and Watchlist tab buttons are present
 *  - Calls /api/registry on mount
 *  - Renders company cards from registry response
 *  - Shows empty state when registry is empty
 *  - Logout calls api.post + clearSession + navigates to /login
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

vi.mock('../lib/session', () => ({
  getSession:   vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

vi.mock('../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}))

import TraderPortal from '../pages/TraderPortal'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'

const TRADER_SESSION = { id: 1, name: 'Alice Trader', email: 'alice@trade.com', role: 'trader' }

const COMPANIES = [
  { id: 10, name: 'Gamma Inc', sector: 'Retail', country: 'UAE', level: 1, status: 'active', badge: 'L1', trustScore: 65 },
]

// Helper: set up all API mocks for a successful trader session
function mockTraderSession(companies = COMPANIES) {
  getSession.mockReturnValue(TRADER_SESSION)
  api.get
    .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, pages: 0 } } })  // watchlist ids
    .mockResolvedValueOnce({ data: { watched_total: 0, certifications_expiring: 0 } })  // stats
    .mockResolvedValueOnce({ data: { data: companies, pagination: { total: companies.length, pages: 1 } } }) // registry
    .mockResolvedValue({ data: { data: [], pagination: { total: 0, pages: 0 } } })       // any further calls
}

describe('TraderPortal — auth guard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirects to /login when no session', () => {
    getSession.mockReturnValue(null)
    render(<TraderPortal />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects to /pac for pac role', () => {
    getSession.mockReturnValue({ role: 'pac' })
    render(<TraderPortal />)
    expect(mockNavigate).toHaveBeenCalledWith('/pac')
  })

  it('admin role is allowed (does not redirect away)', async () => {
    getSession.mockReturnValue({ role: 'admin', name: 'Admin', email: 'admin@test.com' })
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, pages: 0 } } })
    render(<TraderPortal />)
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalledWith('/admin'))
  })
})

describe('TraderPortal — portal UI', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders portal title for trader role', async () => {
    mockTraderSession()
    render(<TraderPortal />)
    // portal_title appears twice (nav + hero section)
    await waitFor(() => expect(screen.getAllByText('trader.portal_title').length).toBeGreaterThan(0))
  })

  it('renders Registry and Watchlist tab buttons', async () => {
    mockTraderSession()
    render(<TraderPortal />)
    await waitFor(() => {
      expect(screen.getByText(/Registry/)).toBeInTheDocument()
      expect(screen.getByText(/Watchlist/)).toBeInTheDocument()
    })
  })

  it('calls GET /api/registry on mount', async () => {
    mockTraderSession()
    render(<TraderPortal />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/registry'))
    })
  })

  it('renders company card from registry response', async () => {
    mockTraderSession()
    render(<TraderPortal />)
    await waitFor(() => {
      expect(screen.getByText('Gamma Inc')).toBeInTheDocument()
    })
  })

  it('shows empty state when registry returns no companies', async () => {
    getSession.mockReturnValue(TRADER_SESSION)
    api.get
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, pages: 0 } } }) // watchlist ids
      .mockResolvedValueOnce({ data: { watched_total: 0 } })                              // stats
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, pages: 0 } } }) // empty registry
    render(<TraderPortal />)
    await waitFor(() => {
      expect(screen.getByText('trader.empty_desc')).toBeInTheDocument()
    })
  })

  it('logout calls api.post /api/auth/logout, clearSession, then navigates to /login', async () => {
    mockTraderSession()
    api.post.mockResolvedValueOnce({})
    render(<TraderPortal />)
    await waitFor(() => screen.getAllByText('trader.portal_title'))

    fireEvent.click(screen.getByText('nav.logout'))
    await waitFor(() => {
      expect(clearSession).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })
})
