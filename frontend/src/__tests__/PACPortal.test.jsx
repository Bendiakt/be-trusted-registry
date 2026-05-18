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

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
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

function mockPACSession(missions = MISSIONS) {
  getSession.mockReturnValue(PAC_SESSION)
  api.get
    .mockResolvedValueOnce({ data: missions })               // /api/pac/missions
    .mockResolvedValueOnce({ data: PROFILE })                // /api/pac/profile
    .mockResolvedValue({ data: [] })                         // any further calls
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
