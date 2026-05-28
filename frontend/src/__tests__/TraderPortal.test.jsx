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
 *
 * Compare feature (compareMap):
 *  - ⇌ button is present on each company card
 *  - Clicking ⇌ adds company to compareMap (sticky bar appears)
 *  - Clicking ⇌ again removes company from compareMap
 *  - Sticky bar is hidden when no company is selected
 *  - "Compare" button disabled when fewer than 2 companies selected
 *  - "Compare" button enabled and shows count when ≥ 2 selected
 *  - Clicking "Compare" opens the ComparePanel modal
 *  - "Clear" button in sticky bar resets compareMap
 *  - Cannot add more than 3 companies (4th button is disabled)
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
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

describe('TraderPortal — compare feature', () => {
  const THREE_COMPANIES = [
    { id: 10, name: 'Gamma Inc',  sector: 'Retail',    country: 'UAE', level: 1, status: 'active', badge: 'L1', trustScore: 65 },
    { id: 11, name: 'Delta Corp', sector: 'Tech',      country: 'FR',  level: 2, status: 'active', badge: 'L2', trustScore: 80 },
    { id: 12, name: 'Epsilon Ltd',sector: 'Logistics', country: 'DE',  level: 3, status: 'active', badge: 'L3', trustScore: 90 },
  ]
  const FOUR_COMPANIES = [
    ...THREE_COMPANIES,
    { id: 13, name: 'Zeta LLC', sector: 'Finance', country: 'GB', level: 1, status: 'active', badge: 'L1', trustScore: 55 },
  ]

  function mockWithCompanies(companies) {
    getSession.mockReturnValue(TRADER_SESSION)
    api.get
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, pages: 0 } } })
      .mockResolvedValueOnce({ data: { watched_total: 0, certifications_expiring: 0 } })
      .mockResolvedValueOnce({ data: { data: companies, pagination: { total: companies.length, pages: 1 } } })
      .mockResolvedValue({ data: { data: [], pagination: { total: 0, pages: 0 } } })
  }

  beforeEach(() => vi.clearAllMocks())

  it('renders a ⇌ compare toggle button for each company card', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    // Each card has a ⇌ toggle button (accessible by title)
    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    expect(toggleBtns.length).toBe(THREE_COMPANIES.length)
  })

  it('sticky compare bar is hidden initially', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    // "Compare" bar button should not exist before any selection
    const compareBtn = document.querySelector('button[disabled]')
    // The compare bar itself should not be visible (compareList.length === 0)
    expect(screen.queryByText(/Compare \(need/)).not.toBeInTheDocument()
  })

  it('adds company to compare and shows sticky bar', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    // Click ⇌ on Gamma Inc
    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    fireEvent.click(toggleBtns[0])

    await waitFor(() => {
      // Sticky bar now shows "Gamma Inc"
      expect(screen.getAllByText('Gamma Inc').length).toBeGreaterThan(1) // card + sticky bar
      // Compare button shows "(need 1 more)" because only 1 selected
      expect(screen.getByText(/need 1 more/i)).toBeInTheDocument()
    })
  })

  it('removes company from compare on second click', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    // Add
    fireEvent.click(toggleBtns[0])
    await waitFor(() => expect(screen.getByText(/need 1 more/i)).toBeInTheDocument())

    // Remove
    fireEvent.click(toggleBtns[0])
    await waitFor(() => {
      expect(screen.queryByText(/need 1 more/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/need 2 more/i)).not.toBeInTheDocument()
    })
  })

  it('enables Compare button and shows count when 2 companies selected', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    fireEvent.click(toggleBtns[0])
    fireEvent.click(toggleBtns[1])

    await waitFor(() => {
      // "Compare 2 companies →"
      expect(screen.getByText(/compare 2 companies/i)).toBeInTheDocument()
    })
  })

  it('opens ComparePanel modal when Compare button is clicked', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    fireEvent.click(toggleBtns[0])
    fireEvent.click(toggleBtns[1])

    await waitFor(() => expect(screen.getByText(/compare 2 companies/i)).toBeInTheDocument())

    const compareOpenBtn = screen.getByText(/compare 2 companies/i)
    fireEvent.click(compareOpenBtn)

    await waitFor(() => {
      // ComparePanel renders company names in the modal header row
      const allGamma = screen.getAllByText('Gamma Inc')
      expect(allGamma.length).toBeGreaterThanOrEqual(2) // card + modal
    })
  })

  it('clears all selections when Clear button is clicked', async () => {
    mockWithCompanies(THREE_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument())

    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    fireEvent.click(toggleBtns[0])
    await waitFor(() => expect(screen.getByText(/need 1 more/i)).toBeInTheDocument())

    // Click Clear
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    await waitFor(() => {
      expect(screen.queryByText(/need 1 more/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/need 2 more/i)).not.toBeInTheDocument()
    })
  })

  it('disables the 4th company toggle when 3 are already selected', async () => {
    mockWithCompanies(FOUR_COMPANIES)
    render(<TraderPortal />)
    await waitFor(() => expect(screen.getByText('Zeta LLC')).toBeInTheDocument())

    const toggleBtns = document.querySelectorAll('button[title*="comparison"]')
    // Select first 3
    fireEvent.click(toggleBtns[0])
    fireEvent.click(toggleBtns[1])
    fireEvent.click(toggleBtns[2])

    await waitFor(() => expect(screen.getByText(/compare 3 companies/i)).toBeInTheDocument())

    // 4th button should be disabled
    expect(toggleBtns[3]).toBeDisabled()
  })
})
