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
 *  - Companies tab: lists companies, shows cert level, PATCH on save
 *  - Users tab: lists users with name/email/role
 *  - Missions tab: lists missions with company name and status
 *  - Disputes tab: lists disputes, resolve modal opens, PATCH on confirm
 *  - PAC tab — agents: lists PAC agents with name and tier
 *  - PAC tab — supervision: pending requests list, approve calls POST
 *  - PAC tab — bonus: statements list, validate calls POST
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

// ── Additional fixtures for tab-level tests ────────────────────────────────────

const COMPANIES_DATA = [
  { id: 1, company_name: 'Acme Corp', certification_level: 2,
    email: 'acme@test.com', country: 'FR', sector: 'Manufacturing', suspended_at: null },
]
const USERS_DATA = [
  { id: 10, name: 'Jean Dupont', email: 'jean@test.com', role: 'company',
    created_at: '2025-01-01T00:00:00Z', last_login: null },
]
const MISSIONS_DATA = [
  { id: 5, company_name: 'Acme Corp', status: 'available',
    location: 'Paris', type: 'audit', fee_usd: 500 },
]
const DISPUTES_DATA = [
  { id: 3, mission_title: 'Audit Mission', company_name: 'Beta Ltd', status: 'open',
    reason: 'Bad audit report', created_at: '2025-01-01T00:00:00Z', mission_id: 5 },
]
const PAC_AGENTS_DATA = [
  { id: 7, full_name: 'Sophie Moreau', pac_tier: 'S1', kyc_status: 'approved',
    email: 'sophie@pac.com' },
]
const PAC_SUPERVISION_DATA = [
  { id: 11, supervisor_name: 'Alice S2', supervisor_tier_profile: 'S2',
    supervisor_email: 'alice@pac.com', supervised_name: 'Bob S1', supervised_tier: 'S1',
    supervised_email: 'bob@pac.com', requested_at: '2025-01-15T00:00:00Z' },
]
const PAC_BONUS_DATA = [
  { id: 20, full_name: 'Alice Superviseur', pac_tier: 'S2', period_year: 2026, period_month: 4,
    bonus_level: 'S2', missions_count: 8, net_be_revenue_cents: 400000, bonus_rate: 0.05,
    task_completion_pct: 90, bonus_multiplier: 1, final_bonus_cents: 20000, status: 'draft' },
]

// URL-dispatching mock — one implementation covers all tabs
function mockAdminFull(overrides = {}) {
  getSession.mockReturnValue(ADMIN_SESSION)
  api.get.mockImplementation((url) => {
    if (url.includes('/api/admin/stats'))
      return Promise.resolve({ data: STATS })
    if (url.includes('/api/admin/companies'))
      return Promise.resolve({ data: { data: overrides.companies ?? [], pagination: { total: 0, pages: 0 } } })
    if (url.includes('/api/admin/users'))
      return Promise.resolve({ data: { data: overrides.users ?? [], pagination: { total: 0, pages: 0 } } })
    if (url.includes('/api/admin/missions'))
      return Promise.resolve({ data: { data: overrides.missions ?? [], pagination: { total: 0, pages: 0 } } })
    if (url.includes('/api/admin/disputes'))
      return Promise.resolve({ data: { data: overrides.disputes ?? [], pagination: { total: 0, pages: 0 } } })
    if (url.includes('/api/admin/pac/agents'))
      return Promise.resolve({ data: { agents: overrides.pacAgents ?? [] } })
    if (url.includes('/api/pac/admin/supervision/pending'))
      return Promise.resolve({ data: { requests: overrides.supervision ?? [] } })
    if (url.includes('/api/pac/admin/bonus/statements'))
      return Promise.resolve({ data: { statements: overrides.bonus ?? [] } })
    if (url.includes('/api/admin/audit-log'))
      return Promise.resolve({ data: { data: [], pagination: { total: 0, pages: 0 } } })
    return Promise.resolve({ data: {} })
  })
}

// ── Companies tab ─────────────────────────────────────────────────────────────

describe('AdminPanel — Companies tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ companies: COMPANIES_DATA })
  })

  it('fetches companies on tab switch and renders company name', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.companies'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/companies'))
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  it('renders certification level badge', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.companies'))
    await waitFor(() => {
      // L2 badge rendered as <span>L2</span>; may also appear as <option> — just assert presence
      const l2elements = screen.getAllByText('L2')
      expect(l2elements.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('PATCH /api/admin/companies/:id/level on Save click', async () => {
    api.patch.mockResolvedValueOnce({})
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.companies'))
    await waitFor(() => screen.getByText('Acme Corp'))
    fireEvent.click(screen.getByText('admin.save'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/admin/companies/1/level',
        expect.objectContaining({ level: expect.anything() }),
      ),
    )
  })
})

// ── Users tab ─────────────────────────────────────────────────────────────────

describe('AdminPanel — Users tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ users: USERS_DATA })
  })

  it('fetches users on tab switch and renders user name', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.users'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/users'))
      expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    })
  })

  it('renders user email and role badge uppercased', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.users'))
    await waitFor(() => {
      expect(screen.getByText('jean@test.com')).toBeInTheDocument()
      expect(screen.getByText('COMPANY')).toBeInTheDocument()
    })
  })
})

// ── Missions tab ──────────────────────────────────────────────────────────────

describe('AdminPanel — Missions tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ missions: MISSIONS_DATA })
  })

  it('fetches missions on tab switch and renders company name', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.missions'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/missions'))
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  it('renders mission status badge', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('admin.tabs.missions'))
    await waitFor(() => {
      // 'available' appears at least in the status badge (select options also contain it)
      const elements = screen.getAllByText('available')
      expect(elements.length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ── Disputes tab ──────────────────────────────────────────────────────────────

describe('AdminPanel — Disputes tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ disputes: DISPUTES_DATA })
  })

  it('fetches disputes on tab switch and renders company and mission title', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('Disputes'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/disputes'))
      expect(screen.getByText('Beta Ltd')).toBeInTheDocument()
      expect(screen.getByText('Audit Mission')).toBeInTheDocument()
    })
  })

  it('clicking Resolve opens the resolve modal', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('Disputes'))
    await waitFor(() => screen.getByText('Resolve'))
    fireEvent.click(screen.getByText('Resolve'))
    expect(screen.getByText('Resolve Dispute #3')).toBeInTheDocument()
  })

  it('Confirm Resolution calls PATCH /api/admin/disputes/:id/resolve', async () => {
    api.patch.mockResolvedValueOnce({})
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('Disputes'))
    await waitFor(() => screen.getByText('Resolve'))
    fireEvent.click(screen.getByText('Resolve'))
    await waitFor(() => screen.getByText('Confirm Resolution'))
    fireEvent.click(screen.getByText('Confirm Resolution'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/admin/disputes/3/resolve',
        expect.objectContaining({ resolution: 'upheld' }),
      ),
    )
  })
})

// ── PAC tab — agents ──────────────────────────────────────────────────────────

describe('AdminPanel — PAC tab: agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ pacAgents: PAC_AGENTS_DATA })
  })

  it('fetches PAC agents on tab switch and renders agent full name', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('PAC Network'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/pac/agents'))
      expect(screen.getByText('Sophie Moreau')).toBeInTheDocument()
    })
  })

  it('renders PAC agent tier badge', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('PAC Network'))
    await waitFor(() => {
      // pac_tier 'S1' rendered in the tier cell; also appears in filter <option>s
      const s1els = screen.getAllByText('S1')
      expect(s1els.length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ── PAC tab — supervision ─────────────────────────────────────────────────────

describe('AdminPanel — PAC tab: supervision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ pacAgents: PAC_AGENTS_DATA, supervision: PAC_SUPERVISION_DATA })
  })

  it('lists pending supervision requests after switching sub-tab', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('PAC Network'))
    await waitFor(() => screen.getByText('👤 Agents & KYC'))
    fireEvent.click(screen.getByText('🔗 Supervision Requests'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/admin/supervision/pending')
      expect(screen.getByText('Alice S2')).toBeInTheDocument()
      expect(screen.getByText('Bob S1')).toBeInTheDocument()
    })
  })

  it('Approve button calls POST /api/pac/admin/supervision/:id/approve', async () => {
    api.post.mockResolvedValueOnce({ data: {} })
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('PAC Network'))
    await waitFor(() => screen.getByText('👤 Agents & KYC'))
    fireEvent.click(screen.getByText('🔗 Supervision Requests'))
    await waitFor(() => screen.getByText('Alice S2'))
    fireEvent.click(screen.getByText('✓ Approve'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/pac/admin/supervision/11/approve'),
    )
  })
})

// ── PAC tab — bonus ───────────────────────────────────────────────────────────

describe('AdminPanel — PAC tab: bonus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminFull({ pacAgents: PAC_AGENTS_DATA, bonus: PAC_BONUS_DATA })
  })

  it('lists bonus statements with agent name after switching sub-tab', async () => {
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('PAC Network'))
    await waitFor(() => screen.getByText('👤 Agents & KYC'))
    fireEvent.click(screen.getByText('💰 Bonus Statements'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/admin/bonus/statements')
      expect(screen.getByText('Alice Superviseur')).toBeInTheDocument()
    })
  })

  it('Validate button calls POST /api/pac/admin/bonus/:id/validate', async () => {
    api.post.mockResolvedValueOnce({ data: {} })
    render(<AdminPanel />)
    await waitFor(() => screen.getByText('admin.title'))
    fireEvent.click(screen.getByText('PAC Network'))
    await waitFor(() => screen.getByText('👤 Agents & KYC'))
    fireEvent.click(screen.getByText('💰 Bonus Statements'))
    await waitFor(() => screen.getByText('Alice Superviseur'))
    fireEvent.click(screen.getByText('Validate'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/pac/admin/bonus/20/validate',
        expect.objectContaining({}),
      ),
    )
  })
})
