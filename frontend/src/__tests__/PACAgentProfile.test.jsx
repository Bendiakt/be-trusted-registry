/**
 * Tests for PACAgentProfile page (public individual agent profile).
 *
 * Covers:
 *  - Calls GET /api/pac/directory/:id on mount
 *  - Renders agent name, tier badge, KYC badge
 *  - Renders agent bio, location, expertise tags, language tags
 *  - Renders stats cards (missions, ontime)
 *  - Renders mission history table with correct columns
 *  - Shows error message when API fails (non-404)
 *  - Redirects to /agents on 404
 *  - Renders CTA section with i18n keys
 *  - Shows loading skeletons during fetch
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  Link:       ({ children, to }) => <a href={to}>{children}</a>,
  useParams:  () => ({ id: '42' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, params) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="lang-switcher" />,
}))

vi.mock('../components/Skeleton', () => ({
  default: ({ style }) => <div data-testid="skeleton" style={style} />,
}))

import PACAgentProfile from '../pages/PACAgentProfile'
import api from '../lib/api'

const AGENT = {
  id: 42,
  name: 'Alice Mbeki',
  tier: 'S2',
  location: 'Johannesburg, ZA',
  bio: 'Senior supply chain expert with ESG focus.',
  expertise: 'ESG,Supply Chain,Audit',
  languages: 'fr,en',
  certifications: 'ISO-9001',
  memberSince: '2021-06-01T00:00:00Z',
  promotedS2: '2022-03-15T00:00:00Z',
  promotedS3: null,
  missionsCompleted: 24,
  l2MissionsCompleted: 8,
  missionsOnTime: 20,
  avgClientScore: 4.6,
  avgAdminScore: 4.8,
}

const HISTORY = [
  {
    type: 'site_inspection',
    location: 'Paris, FR',
    tierRequired: 'S2',
    outcome: 'pass',
    clientScore: 5,
    adminScore: 4,
    onTime: true,
    completedAt: '2026-03-10T00:00:00Z',
  },
  {
    type: 'document_check',
    location: 'Lyon, FR',
    tierRequired: 'S1',
    outcome: 'fail',
    clientScore: null,
    adminScore: null,
    onTime: false,
    completedAt: '2026-02-01T00:00:00Z',
  },
]

const SUCCESS_RESPONSE = { data: { agent: AGENT, missionHistory: HISTORY } }
const EMPTY_HISTORY    = { data: { agent: AGENT, missionHistory: [] } }

describe('PACAgentProfile — data loading', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls GET /api/pac/directory/42 on mount', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/directory/42')
    })
  })

  it('shows loading skeletons while fetching', () => {
    api.get.mockReturnValue(new Promise(() => {}))
    render(<PACAgentProfile />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('shows error message when API fails (non-404)', async () => {
    const err = new Error('Server error')
    err.response = { status: 500 }
    api.get.mockRejectedValue(err)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.error_load')).toBeInTheDocument()
    })
  })

  it('navigates to /agents on 404', async () => {
    const err = new Error('Not found')
    err.response = { status: 404 }
    api.get.mockRejectedValue(err)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/agents', { replace: true })
    })
  })
})

describe('PACAgentProfile — profile content', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders agent name', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('Alice Mbeki')).toBeInTheDocument()
    })
  })

  it('renders tier badge label', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('S2 Certified')).toBeInTheDocument()
    })
  })

  it('renders KYC verified badge (i18n key)', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.kyc_verified')).toBeInTheDocument()
    })
  })

  it('renders agent location', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText(/Johannesburg/)).toBeInTheDocument()
    })
  })

  it('renders agent bio', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText(/Senior supply chain expert/)).toBeInTheDocument()
    })
  })

  it('renders expertise tags', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('ESG')).toBeInTheDocument()
      expect(screen.getByText('Supply Chain')).toBeInTheDocument()
    })
  })

  it('renders language tags', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText(/🌐 fr/)).toBeInTheDocument()
    })
  })
})

describe('PACAgentProfile — stats', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders missions stat card with correct count', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      // stat label key + value 24
      expect(screen.getByText('agents.profile.stat_missions')).toBeInTheDocument()
      expect(screen.getByText('24')).toBeInTheDocument()
    })
  })

  it('renders on-time stat', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.stat_ontime')).toBeInTheDocument()
      // 20/24 = 83%
      expect(screen.getByText('83%')).toBeInTheDocument()
    })
  })

  it('renders client rating stat', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.stat_client')).toBeInTheDocument()
    })
  })
})

describe('PACAgentProfile — mission history', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders history table title', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.history_title')).toBeInTheDocument()
    })
  })

  it('renders history column headers', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.col_type')).toBeInTheDocument()
      expect(screen.getByText('agents.profile.col_zone')).toBeInTheDocument()
      expect(screen.getByText('agents.profile.col_outcome')).toBeInTheDocument()
      expect(screen.getByText('agents.profile.col_date')).toBeInTheDocument()
    })
  })

  it('renders mission rows with location data', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('Paris, FR')).toBeInTheDocument()
      expect(screen.getByText('Lyon, FR')).toBeInTheDocument()
    })
  })

  it('shows on-time indicator for on-time mission', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.ontime_yes')).toBeInTheDocument()
    })
  })

  it('shows late indicator for delayed mission', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.ontime_late')).toBeInTheDocument()
    })
  })

  it('hides history section when mission history is empty', async () => {
    api.get.mockResolvedValue(EMPTY_HISTORY)
    render(<PACAgentProfile />)
    await waitFor(() => screen.getByText('Alice Mbeki'))
    expect(screen.queryByText('agents.profile.history_title')).not.toBeInTheDocument()
  })
})

describe('PACAgentProfile — CTA section', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders CTA title and description keys', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.cta_title')).toBeInTheDocument()
      expect(screen.getByText('agents.profile.cta_desc')).toBeInTheDocument()
    })
  })

  it('renders back-to-agents and register links', async () => {
    api.get.mockResolvedValue(SUCCESS_RESPONSE)
    render(<PACAgentProfile />)
    await waitFor(() => {
      expect(screen.getByText('agents.profile.cta_agents')).toBeInTheDocument()
      expect(screen.getByText('agents.profile.cta_register')).toBeInTheDocument()
    })
  })
})
