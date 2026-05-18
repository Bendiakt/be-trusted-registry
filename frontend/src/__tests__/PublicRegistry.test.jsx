/**
 * Tests for PublicRegistry page.
 *
 * The page fires two API calls on mount:
 *  1. GET /api/registry?limit=200   — preload country list
 *  2. GET /api/registry?page=1&... — paginated company listing
 *
 * Covers:
 *  - Calls /api/registry on mount
 *  - Renders company cards when data returns
 *  - Shows empty state when result is empty
 *  - Shows error key when API rejects
 *  - Search input and level select are present
 *  - Country select rendered after countries preload
 *  - Login and Register nav links present
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

vi.mock('../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}))

import PublicRegistry from '../pages/PublicRegistry'
import api from '../lib/api'

// Default mock responses
const COMPANIES = [
  { id: 1, name: 'Alpha Corp',  sector: 'Tech',  country: 'UAE', level: 2, status: 'active', badge: 'L2', trustScore: 80 },
  { id: 2, name: 'Beta Supply', sector: 'Trade', country: 'France', level: 1, status: 'active', badge: 'L1', trustScore: 55 },
]

const REGISTRY_RESPONSE = {
  data: { data: COMPANIES, pagination: { total: 2, pages: 1 } },
}

const COUNTRY_RESPONSE = {
  data: { data: COMPANIES, pagination: { total: 2, pages: 1 } },
}

function mockBothCalls() {
  // First call = country preload (limit=200), second = paginated listing
  api.get
    .mockResolvedValueOnce(COUNTRY_RESPONSE)  // country preload
    .mockResolvedValueOnce(REGISTRY_RESPONSE) // paginated listing
}

describe('PublicRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls GET /api/registry on mount', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/registry'))
    })
  })

  it('renders company names after API resolves', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => {
      expect(screen.getByText('Alpha Corp')).toBeInTheDocument()
      expect(screen.getByText('Beta Supply')).toBeInTheDocument()
    })
  })

  it('shows empty state when API returns no companies', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, pages: 0 } } }) // country preload
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, pages: 0 } } }) // listing
    render(<PublicRegistry />)
    await waitFor(() => {
      expect(screen.getByText('trader.empty_title')).toBeInTheDocument()
    })
  })

  it('shows error key when API rejects', async () => {
    api.get
      .mockResolvedValueOnce(COUNTRY_RESPONSE) // country preload succeeds
      .mockRejectedValueOnce(new Error('network error')) // listing fails
    render(<PublicRegistry />)
    await waitFor(() => {
      expect(screen.getByText('trader.error')).toBeInTheDocument()
    })
  })

  it('renders search input', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    // Drain async queue then assert on sync element
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(document.querySelector('input[type="text"]')).toBeInTheDocument()
  })

  it('renders level select with All Levels option', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    const selects = document.querySelectorAll('select')
    expect(selects.length).toBeGreaterThanOrEqual(1)
    await waitFor(() => {
      expect(screen.getByText('trader.all_levels')).toBeInTheDocument()
    })
  })

  it('renders country select after countries preload', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => {
      expect(screen.getByText('trader.all_countries')).toBeInTheDocument()
    })
  })

  it('has a login nav link', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument()
  })

  it('has a register nav link', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument()
  })

  it('has a home logo link', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(document.querySelector('a[href="/"]')).toBeInTheDocument()
  })

  it('shows verify links for each company', async () => {
    mockBothCalls()
    render(<PublicRegistry />)
    await waitFor(() => {
      expect(document.querySelector('a[href="/verify/1"]')).toBeInTheDocument()
      expect(document.querySelector('a[href="/verify/2"]')).toBeInTheDocument()
    })
  })
})
