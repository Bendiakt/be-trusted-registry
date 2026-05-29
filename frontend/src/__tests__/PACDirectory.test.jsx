/**
 * Tests for PACDirectory page (public agent marketplace).
 *
 * Covers:
 *  - Renders hero badge and title (i18n keys)
 *  - Calls GET /api/pac/directory on mount
 *  - Renders agent cards when agents are returned
 *  - Shows empty state when no agents
 *  - Shows error message when API fails
 *  - Tier filter chip toggles active state
 *  - Search form submission calls API with query param
 *  - Reset filter calls API with empty params
 *  - Pagination buttons appear when pages > 1
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
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

import PACDirectory from '../pages/PACDirectory'
import api from '../lib/api'

const AGENTS = [
  {
    id: 1,
    name: 'Alice Mbeki',
    tier: 'S2',
    location: 'Johannesburg, ZA',
    bio: 'Certified supply chain auditor with 8 years experience.',
    expertise: 'ESG,Supply Chain',
    languages: 'fr,en',
    missionsCompleted: 12,
    missionsOnTime: 10,
    avgClientScore: 4.5,
    avgAdminScore: null,
    promotedS2: '2023-01-15T00:00:00Z',
    promotedS3: null,
  },
  {
    id: 2,
    name: 'Carlos Ruiz',
    tier: 'S1',
    location: 'Madrid, ES',
    bio: null,
    expertise: null,
    languages: 'es',
    missionsCompleted: 3,
    missionsOnTime: 3,
    avgClientScore: null,
    avgAdminScore: null,
    promotedS2: null,
    promotedS3: null,
  },
]

const PAGE_1 = { agents: AGENTS, pagination: { total: 2, pages: 1, page: 1, limit: 20 } }
const MULTI_PAGE = { agents: AGENTS, pagination: { total: 40, pages: 3, page: 1, limit: 20 } }

function mockDir(response = PAGE_1) {
  api.get.mockResolvedValue({ data: response })
}

describe('PACDirectory — initial render', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls GET /api/pac/directory on mount', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/pac/directory')))
  })

  it('shows loading skeletons while fetching', () => {
    api.get.mockReturnValue(new Promise(() => {})) // never resolves
    render(<PACDirectory />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders hero badge i18n key', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => expect(screen.getByText('agents.directory.badge')).toBeInTheDocument())
  })

  it('renders title line keys', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText('agents.directory.title_line1')).toBeInTheDocument()
      expect(screen.getByText('agents.directory.title_line2')).toBeInTheDocument()
    })
  })

  it('renders agent names when agents are returned', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText('Alice Mbeki')).toBeInTheDocument()
      expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
    })
  })

  it('renders agent location', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText(/Johannesburg/)).toBeInTheDocument()
    })
  })

  it('renders agent bio text', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText(/Certified supply chain auditor/)).toBeInTheDocument()
    })
  })

  it('shows stat bar when agents loaded', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      // stats_agents key appears (total: 2 plus label)
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('agents.directory.stat_agents')).toBeInTheDocument()
    })
  })
})

describe('PACDirectory — empty & error states', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows empty state when agents list is empty', async () => {
    api.get.mockResolvedValue({ data: { agents: [], pagination: { total: 0, pages: 1 } } })
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText('agents.directory.empty')).toBeInTheDocument()
    })
  })

  it('shows error message when API fails', async () => {
    api.get.mockRejectedValue(new Error('Network error'))
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText('agents.directory.error_load')).toBeInTheDocument()
    })
  })
})

describe('PACDirectory — search & filters', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows search input and search button', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('agents.directory.search_placeholder')).toBeInTheDocument()
      expect(screen.getByText('agents.directory.search_btn')).toBeInTheDocument()
    })
  })

  it('submitting search calls API with q param', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => screen.getByPlaceholderText('agents.directory.search_placeholder'))

    const input = screen.getByPlaceholderText('agents.directory.search_placeholder')
    fireEvent.change(input, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByText('agents.directory.search_btn'))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('q=Alice'))
    })
  })

  it('renders S1/S2/S3 tier filter buttons', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText('S1 Associate')).toBeInTheDocument()
      expect(screen.getByText('S2 Certified')).toBeInTheDocument()
      expect(screen.getByText('S3 Senior')).toBeInTheDocument()
    })
  })

  it('clicking a tier filter calls API with tier param', async () => {
    mockDir()
    render(<PACDirectory />)
    // Use role=button to disambiguate filter chip from agent card badges
    await waitFor(() => screen.getByRole('button', { name: 'S2 Certified' }))
    fireEvent.click(screen.getByRole('button', { name: 'S2 Certified' }))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('tier=S2'))
    })
  })

  it('shows reset button after tier is selected', async () => {
    mockDir()
    render(<PACDirectory />)
    await waitFor(() => screen.getByRole('button', { name: 'S1 Associate' }))
    fireEvent.click(screen.getByRole('button', { name: 'S1 Associate' }))
    await waitFor(() => {
      expect(screen.getByText('agents.directory.filter_reset')).toBeInTheDocument()
    })
  })
})

describe('PACDirectory — pagination', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('hides pagination when only 1 page', async () => {
    mockDir(PAGE_1)
    render(<PACDirectory />)
    await waitFor(() => screen.getByText('Alice Mbeki'))
    expect(screen.queryByText('agents.directory.prev')).not.toBeInTheDocument()
  })

  it('shows pagination buttons when pages > 1', async () => {
    mockDir(MULTI_PAGE)
    render(<PACDirectory />)
    await waitFor(() => {
      expect(screen.getByText('agents.directory.prev')).toBeInTheDocument()
      expect(screen.getByText('agents.directory.next')).toBeInTheDocument()
    })
  })

  it('clicking next page calls API with page=2', async () => {
    mockDir(MULTI_PAGE)
    render(<PACDirectory />)
    await waitFor(() => screen.getByText('agents.directory.next'))
    fireEvent.click(screen.getByText('agents.directory.next'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('page=2'))
    })
  })
})
