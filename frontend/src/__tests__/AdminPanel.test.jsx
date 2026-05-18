/**
 * Tests for AdminPanel page.
 *
 * Auth guard: only 'admin' role may access. All others → /login.
 * Default tab: 'overview' — calls /api/admin/stats on mount.
 *
 * Covers:
 *  - Redirects to /login when no session
 *  - Redirects to /login for non-admin roles (company, trader, pac)
 *  - Renders admin title for admin role
 *  - All five tab buttons are present (overview, users, companies, missions, audit)
 *  - Calls /api/admin/stats on mount
 *  - Renders stats values in overview tab
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
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

vi.mock('../lib/session', () => ({
  getSession:   vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import AdminPanel from '../pages/AdminPanel'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'

const ADMIN_SESSION = { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' }

const STATS = {
  users:     { total: 42, last_30d: 8 },
  companies: { total: 18, certified: 11 },
  revenue:   { total_usd: 12400 },
}

function mockAdminSession() {
  getSession.mockReturnValue(ADMIN_SESSION)
  // overview loads stats; any extra calls for users/companies/missions/audit return empty
  api.get
    .mockResolvedValueOnce({ data: STATS })                                               // /api/admin/stats
    .mockResolvedValue({ data: { data: [], pagination: { total: 0, pages: 0 } } })        // catch-all
}

describe('AdminPanel — auth guard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirects to /login when no session', () => {
    getSession.mockReturnValue(null)
    render(<AdminPanel />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login for company role', () => {
    getSession.mockReturnValue({ role: 'company' })
    render(<AdminPanel />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login for trader role', () => {
    getSession.mockReturnValue({ role: 'trader' })
    render(<AdminPanel />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login for pac role', () => {
    getSession.mockReturnValue({ role: 'pac' })
    render(<AdminPanel />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})

describe('AdminPanel — portal UI', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders admin title for admin role', async () => {
    mockAdminSession()
    render(<AdminPanel />)
    await waitFor(() => {
      expect(screen.getByText('admin.title')).toBeInTheDocument()
    })
  })

  it('renders all five tab buttons', async () => {
    mockAdminSession()
    render(<AdminPanel />)
    await waitFor(() => {
      expect(screen.getByText('admin.tabs.overview')).toBeInTheDocument()
      expect(screen.getByText('admin.tabs.users')).toBeInTheDocument()
      expect(screen.getByText('admin.tabs.companies')).toBeInTheDocument()
      expect(screen.getByText('admin.tabs.missions')).toBeInTheDocument()
      expect(screen.getByText('admin.tabs.audit')).toBeInTheDocument()
    })
  })

  it('calls GET /api/admin/stats on mount', async () => {
    mockAdminSession()
    render(<AdminPanel />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/admin/stats')
    })
  })

  it('renders total_users stat value in overview tab', async () => {
    mockAdminSession()
    render(<AdminPanel />)
    await waitFor(() => {
      // STATS.users.total = 42
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  it('renders total_companies stat value in overview tab', async () => {
    mockAdminSession()
    render(<AdminPanel />)
    await waitFor(() => {
      // STATS.companies.total = 18
      expect(screen.getByText('18')).toBeInTheDocument()
    })
  })

  it('logout calls api.post /api/auth/logout, clearSession, navigates to /login', async () => {
    mockAdminSession()
    api.post.mockResolvedValueOnce({})
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))

    fireEvent.click(screen.getByText('nav.logout'))
    await waitFor(() => {
      expect(clearSession).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })
})
