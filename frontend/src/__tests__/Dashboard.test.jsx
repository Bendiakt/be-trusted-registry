/**
 * Tests for Dashboard page.
 *
 * Auth guard: redirects non-company roles away.
 * On mount calls GET /api/companies/me then GET /api/documents.
 *
 * Covers:
 *  - Redirects to /login when no session
 *  - Redirects pac/admin/trader to their portal
 *  - Renders nav MyDD logo for company role
 *  - Renders all 6 tab buttons (overview, register, pricing, documents, billing, developer, metrics)
 *  - Calls GET /api/companies/me on mount
 *  - Shows user name in nav after profile loads
 *  - Shows email-verification banner when emailVerified=false
 *  - Logout calls api.post + clearSession + navigates to /login
 *  - Overview tab renders onboarding stepper when no company
 *  - WebSocket constructor called on mount (notification channel)
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

// WebSocket mock — must be defined before component import
const mockWsClose = vi.fn()
const MockWebSocket = vi.fn().mockImplementation(() => ({
  close:     mockWsClose,
  onmessage: null,
  onerror:   null,
}))
global.WebSocket = MockWebSocket

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
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

vi.mock('../components/MetricsDashboard', () => ({
  default: () => <div data-testid="metrics-dashboard" />,
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

vi.mock('../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}))

vi.mock('../components/Toast', () => ({
  useToast:       () => [[], vi.fn()],
  ToastContainer: () => <div data-testid="toast-container" />,
}))

import Dashboard from '../pages/Dashboard'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'

const COMPANY_SESSION = { id: 10, name: 'Test Company', email: 'test@co.com', role: 'company' }
const UNVERIFIED_SESSION = { ...COMPANY_SESSION, emailVerified: false }

const PROFILE_RESPONSE = {
  data: {
    company: { id: 1, name: 'Test Corp', certificationLevel: 2, status: 'active' },
    user:    { id: 10, name: 'Test Company', email: 'test@co.com', role: 'company', emailVerified: true },
  },
}

const UNVERIFIED_PROFILE = {
  data: {
    company: null,
    user:    { id: 10, name: 'Test Company', email: 'test@co.com', role: 'company', emailVerified: false },
  },
}

function mockCompanySession(profileRes = PROFILE_RESPONSE) {
  getSession.mockReturnValue(COMPANY_SESSION)
  // URL-aware mock: correct response regardless of effect firing order
  api.get.mockImplementation((url) => {
    if (url === '/api/companies/me') return Promise.resolve(profileRes)
    if (url === '/api/documents')    return Promise.resolve({ data: [] })
    return Promise.resolve({ data: [] })
  })
}

describe('Dashboard — auth guard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirects to /login when no session', () => {
    getSession.mockReturnValue(null)
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects pac role to /pac', () => {
    getSession.mockReturnValue({ role: 'pac' })
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/pac')
  })

  it('redirects admin role to /admin', () => {
    getSession.mockReturnValue({ role: 'admin' })
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })

  it('redirects trader role to /trader', () => {
    getSession.mockReturnValue({ role: 'trader' })
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/trader')
  })
})

describe('Dashboard — UI', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders MyDD logo in nav', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('MyDD')).toBeInTheDocument())
  })

  it('renders all 6 tab buttons', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('dashboard.tabs.overview')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.register')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.pricing')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.documents')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.billing', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.developer', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.metrics')).toBeInTheDocument()
    })
  })

  it('calls GET /api/companies/me on mount', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/companies/me')
    })
  })

  it('shows user name in nav after profile loads', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument()
    })
  })

  it('shows email-verification banner when emailVerified=false', async () => {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me') return Promise.resolve(UNVERIFIED_PROFILE)
      return Promise.resolve({ data: [] })
    })
    render(<Dashboard />)
    await waitFor(() => {
      // Banner rendered when user.emailVerified === false
      expect(screen.getByText('dashboard.verify_email.title')).toBeInTheDocument()
    })
  })

  it('does NOT show email-verification banner when verified', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => screen.getByText('Test Company'))
    expect(screen.queryByText('dashboard.verify_email.banner_text')).not.toBeInTheDocument()
  })

  it('logout calls api.post + clearSession + navigates to /login', async () => {
    mockCompanySession()
    api.post.mockResolvedValueOnce({})
    render(<Dashboard />)
    await waitFor(() => screen.getByText('nav.logout'))

    fireEvent.click(screen.getByText('nav.logout'))
    await waitFor(() => {
      expect(clearSession).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  it('opens WebSocket notification channel on mount', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(MockWebSocket).toHaveBeenCalledWith(
      expect.stringContaining('/ws/metrics')
    )
  })

  it('shows onboarding stepper when no company profile yet', async () => {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me')
        return Promise.resolve({ data: { company: null, user: { ...COMPANY_SESSION, emailVerified: true } } })
      return Promise.resolve({ data: [] })
    })
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('dashboard.onboarding.title')).toBeInTheDocument()
    })
  })
})

describe('Dashboard — missions (audits) tab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const MISSION_UNPAID = {
    id: 42, company_name: 'Test Corp', location: 'Paris, FR',
    type: 'site_inspection', status: 'assigned', outcome: null,
    feeUsd: 500, paymentConfirmedAt: null, completedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
  }

  const MISSION_PAID = {
    id: 43, company_name: 'Test Corp', location: 'Lyon, FR',
    type: 'document_check', status: 'completed', outcome: 'pass',
    feeUsd: 300, paymentConfirmedAt: '2026-05-10T00:00:00Z', completedAt: '2026-05-09T00:00:00Z',
    createdAt: '2026-04-10T00:00:00Z',
  }

  function mockWithMissions(missions) {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me') return Promise.resolve(PROFILE_RESPONSE)
      if (url.startsWith('/api/companies/missions')) return Promise.resolve({ data: { missions } })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/test' } })
  }

  it('renders Audits tab button', async () => {
    mockWithMissions([])
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('dashboard.tabs.audits')).toBeInTheDocument()
    })
  })

  it('clicking Audits tab calls GET /api/companies/missions', async () => {
    mockWithMissions([])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/companies/missions'))
    })
  })

  it('shows pay button for mission with unpaid fee', async () => {
    mockWithMissions([MISSION_UNPAID])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      expect(screen.getByText('💳 Payer $500')).toBeInTheDocument()
    })
  })

  it('shows paid badge for mission with confirmed payment', async () => {
    mockWithMissions([MISSION_PAID])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      expect(screen.getByText('✓ Payé $300')).toBeInTheDocument()
    })
  })

  it('pay button calls POST /api/payments/mission-checkout with missionId', async () => {
    mockWithMissions([MISSION_UNPAID])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => screen.getByText('💳 Payer $500'))
    fireEvent.click(screen.getByText('💳 Payer $500'))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/payments/mission-checkout',
        { missionId: 42 },
      )
    })
  })

  it('shows no-missions message when missions list is empty', async () => {
    mockWithMissions([])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      // t() mock returns key → empty state text is the i18n key
      expect(screen.getByText('dashboard.audits.empty')).toBeInTheDocument()
    })
  })
})
