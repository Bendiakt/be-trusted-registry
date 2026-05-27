/**
 * Tests for PACPortal page.
 *
 * Auth guard: redirects to /login if no session; redirects non-pac roles.
 * Default tab: 'missions' — calls /api/pac/missions + /api/pac/profile on mount.
 *
 * Covers:
 *  - Redirects to /login when no session
 *  - Redirects company/admin users away from PAC portal
 *  - Renders portal header for pac role
 *  - Missions and Profile tab buttons present
 *  - Calls /api/pac/missions on mount
 *  - Renders mission cards when missions are returned
 *  - Shows "no missions" message when missions list is empty
 *  - Logout calls api.post + clearSession + navigates to /login
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

const mockSetSearchParams = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate:      () => mockNavigate,
  useSearchParams:  () => [new URLSearchParams(), mockSetSearchParams],
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('../lib/session', () => ({
  getSession:   vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import PACPortal from '../pages/PACPortal'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'

const PAC_SESSION = { id: 5, name: 'Bob Agent', email: 'bob@pac.com', role: 'pac' }

const MISSIONS = [
  { id: 101, company_name: 'Delta Corp', location: 'Paris', type: 'site_inspection', status: 'available', description: 'Routine check', outcome: null, fee: 300 },
  { id: 102, company_name: 'Echo Ltd',   location: 'Lyon',  type: 'document_check',  status: 'assigned',  description: 'Doc review',   outcome: null, fee: 200 },
]

const PROFILE = { name: 'Bob Agent', location: 'Paris', languages: 'fr,en', certifications: 'ISO-9001', bio: 'Experienced agent' }

const EARNINGS = {
  summary: {
    totalEarnedCents: 5000, totalEarnedUsd: 50.00,
    pendingCents: 7500, pendingUsd: 75.00,
    commissionRate: 0.10, commissionPct: 10, pacTier: 'S1',
    completedCount: 3, paidCount: 1,
  },
  missions: [
    { id: 42, companyName: 'Acme Corp', location: 'Paris, FR', type: 'site_inspection',
      feeUsd: 500, commissionCents: 5000, commissionUsd: 50.00,
      paymentConfirmedAt: '2026-05-01T10:00:00Z', status: 'completed', outcome: 'pass' },
    { id: 43, companyName: 'Beta Ltd', location: 'Lyon, FR', type: 'site_inspection',
      feeUsd: 500, commissionCents: 5000, commissionUsd: 50.00,
      paymentConfirmedAt: null, status: 'completed', outcome: 'pass' },
  ],
}

function mockPACSession(missions = MISSIONS) {
  getSession.mockReturnValue(PAC_SESSION)
  // URL-aware dispatch so new API calls (progress, earnings) don't misroute mock data
  api.get.mockImplementation((url) => {
    if (url === '/api/pac/missions')  return Promise.resolve({ data: missions })
    if (url === '/api/pac/profile')   return Promise.resolve({ data: PROFILE })
    if (url === '/api/pac/earnings')  return Promise.resolve({ data: EARNINGS })
    if (url === '/api/pac/progress')  return Promise.resolve({ data: {} })
    return Promise.resolve({ data: [] })
  })
}

describe('PACPortal — auth guard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirects to /login when no session', () => {
    getSession.mockReturnValue(null)
    render(<PACPortal />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects company role to /dashboard', () => {
    getSession.mockReturnValue({ role: 'company' })
    render(<PACPortal />)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects admin role to /admin', () => {
    getSession.mockReturnValue({ role: 'admin' })
    render(<PACPortal />)
    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })
})

describe('PACPortal — portal UI', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders portal header for pac role', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(screen.getByText('nav.pac_portal')).toBeInTheDocument()
    })
  })

  it('renders Missions and Profile tab buttons', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(screen.getByText('pac.tabs.missions')).toBeInTheDocument()
      expect(screen.getByText('pac.tabs.profile')).toBeInTheDocument()
    })
  })

  it('calls GET /api/pac/missions on mount', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/missions')
    })
  })

  it('calls GET /api/pac/profile on mount', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/profile')
    })
  })

  it('renders mission company names when missions are returned', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(screen.getByText('Delta Corp')).toBeInTheDocument()
      expect(screen.getByText('Echo Ltd')).toBeInTheDocument()
    })
  })

  it('shows "no missions" message when missions list is empty', async () => {
    mockPACSession([])
    render(<PACPortal />)
    await waitFor(() => {
      expect(screen.getByText('pac.missions.no_missions')).toBeInTheDocument()
    })
  })

  it('logout calls api.post /api/auth/logout, clearSession, navigates to /login', async () => {
    mockPACSession()
    api.post.mockResolvedValueOnce({})
    render(<PACPortal />)
    await waitFor(() => screen.getByText('nav.pac_portal'))

    fireEvent.click(screen.getByText('nav.logout'))
    await waitFor(() => {
      expect(clearSession).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })
})

describe('PACPortal — earnings tab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders Earnings tab button', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(screen.getByText('💰 Revenus')).toBeInTheDocument()
    })
  })

  it('fetches GET /api/pac/earnings on mount', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/earnings')
    })
  })

  it('earnings tab shows total earned stat', async () => {
    mockPACSession()
    render(<PACPortal />)
    // Switch to earnings tab
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      // "Total perçu" label must be present in the stat card
      expect(screen.getByText('Total perçu')).toBeInTheDocument()
      // $50.00 appears at least once (stat card + commission column)
      expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('earnings tab shows pending amount stat', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      // Pending = $75.00
      expect(screen.getByText('$75.00')).toBeInTheDocument()
    })
  })

  it('earnings tab shows commission percentage', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      // commissionPct = 10 → "10%"
      expect(screen.getByText('10%')).toBeInTheDocument()
    })
  })

  it('earnings tab shows PAC tier', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      // pacTier = S1 → "Tier S1"
      expect(screen.getByText('Tier S1')).toBeInTheDocument()
    })
  })

  it('earnings tab shows mission company names in breakdown table', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('Beta Ltd')).toBeInTheDocument()
    })
  })

  it('paid mission shows paid badge in earnings table', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      // Acme Corp has paymentConfirmedAt set → badge starts with "✓ Payé" followed by date
      expect(screen.getByText(/✓ Payé/)).toBeInTheDocument()
    })
  })

  it('unpaid mission shows pending badge in earnings table', async () => {
    mockPACSession()
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    await waitFor(() => {
      // Beta Ltd has no paymentConfirmedAt → shows pending indicator
      expect(screen.getByText('⏳ En attente')).toBeInTheDocument()
    })
  })

  it('shows loading state when earnings not yet fetched', async () => {
    getSession.mockReturnValue(PAC_SESSION)
    // Delay the earnings response so loading state is visible
    api.get.mockImplementation((url) => {
      if (url === '/api/pac/earnings') return new Promise(() => {})  // never resolves
      if (url === '/api/pac/missions') return Promise.resolve({ data: [] })
      if (url === '/api/pac/profile')  return Promise.resolve({ data: PROFILE })
      if (url === '/api/pac/progress') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: [] })
    })
    render(<PACPortal />)
    await waitFor(() => screen.getByText('💰 Revenus'))
    fireEvent.click(screen.getByText('💰 Revenus'))
    // Loading placeholder text visible when earnings state is null
    await waitFor(() => {
      expect(screen.getByText('Chargement…')).toBeInTheDocument()
    })
  })
})
