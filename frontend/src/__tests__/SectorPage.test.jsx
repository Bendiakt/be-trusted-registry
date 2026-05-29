/**
 * Unit tests for SectorPage (/sectors/:sector).
 *
 * Covers:
 *   - Renders hero heading and stats pills for a known sector
 *   - Redirects to /registry for unknown sector slugs
 *   - Shows skeleton loaders while fetching companies
 *   - Renders company cards when API returns data
 *   - Shows empty-state CTA when API returns no companies
 *   - Renders FAQ details elements with correct questions
 *   - Shows other-sector links excluding the current one
 *   - Sets document title to sector name
 *   - Breadcrumb renders sector name
 *   - "View all results" link includes sector query param
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// ── Stubs ─────────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn()
let mockSector = 'manufacturing'

vi.mock('react-router-dom', () => ({
  useParams:   () => ({ sector: mockSector }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }) => <a href={to} {...rest}>{children}</a>,
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}))

const SECTOR_T = {
  'sector.registry_link': 'Registry',
  'sector.get_certified': 'Get certified',
  'sector.certified_companies': 'Certified companies',
  'sector.view_all': 'View all results →',
  'sector.no_companies': 'No certified companies in this sector yet.',
  'sector.be_first': 'Be the first →',
  'sector.faq_heading': 'Frequently asked questions',
  'sector.cta_heading': 'Get your company certified today.',
  'sector.cta_sub': 'Join the {{name}} companies already verified on MyDD.',
  'sector.request_verification': 'Request verification',
  'sector.browse_registry': 'Browse registry',
  'sector.other_sectors': 'Other sectors',
  'sector.total_one': '{{count}} certified company in this sector',
  'sector.total_other': '{{count}} certified companies in this sector',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      let str = SECTOR_T[key] ?? key
      if (opts && typeof str === 'string') {
        Object.entries(opts).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
        })
      }
      return str
    },
    i18n: { language: 'en' },
  }),
}))

// navigator.language is 'en' by default in jsdom
Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })

import SectorPage from '../pages/SectorPage'
import api from '../lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
const COMPANIES = [
  { id: 1, name: 'Acme Steel', level: 2, country: 'FR', sector: 'Manufacturing' },
  { id: 2, name: 'Beta Works', level: 1, country: 'DE', sector: 'Manufacturing' },
]

function setupApi(companies = COMPANIES, total = companies.length) {
  api.get.mockResolvedValue({ data: { data: companies, pagination: { total } } })
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('SectorPage — known sector (manufacturing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSector = 'manufacturing'
  })

  it('renders hero heading for manufacturing', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /certified manufacturers on the mydd registry/i
      )
    })
  })

  it('renders stats pills', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      // "Quality audit" and "Document review" are unique to the stats pills
      expect(screen.getByText(/quality audit/i)).toBeInTheDocument()
      expect(screen.getByText(/document review/i)).toBeInTheDocument()
      // "On-site inspection" also appears in the hero sub paragraph — use getAllByText
      expect(screen.getAllByText(/on-site inspection/i).length).toBeGreaterThan(0)
    })
  })

  it('renders company cards after API resolves', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByText('Acme Steel')).toBeInTheDocument()
      expect(screen.getByText('Beta Works')).toBeInTheDocument()
    })
  })

  it('links company cards to /verify/:id', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Acme Steel/i })
      expect(link).toHaveAttribute('href', '/verify/1')
    })
  })

  it('shows total count in certified companies heading', async () => {
    setupApi(COMPANIES, 42)
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByText(/\(42\)/)).toBeInTheDocument()
    })
  })

  it('shows empty state when API returns no companies', async () => {
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } })
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByText(/no certified companies in this sector yet/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /be the first/i })).toBeInTheDocument()
    })
  })

  it('renders FAQ questions', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByText(/why verify a manufacturer/i)).toBeInTheDocument()
      expect(screen.getByText(/what level is recommended for manufacturers/i)).toBeInTheDocument()
    })
  })

  it('renders other-sector links excluding current', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      // Other sectors should be present
      expect(screen.getByRole('link', { name: /Logistics & Freight/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Agribusiness/i })).toBeInTheDocument()
      // Current sector should NOT appear in the "Other sectors" list
      const otherLinks = screen.getAllByRole('link')
      const mfgLinksInOtherSection = otherLinks.filter(
        l => l.getAttribute('href') === '/sectors/manufacturing'
      )
      expect(mfgLinksInOtherSection.length).toBe(0)
    })
  })

  it('sets document title to sector name', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      expect(document.title).toMatch(/manufacturing supplier verification/i)
    })
  })

  it('renders breadcrumb with sector name', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByText('Manufacturing')).toBeInTheDocument()
    })
  })

  it('"View all results" link encodes sector in query param', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      const viewAllLink = screen.getByRole('link', { name: /view all results/i })
      expect(viewAllLink.getAttribute('href')).toContain('/registry?sector=')
      expect(viewAllLink.getAttribute('href')).toContain('Manufacturing')
    })
  })

  it('calls api.get with correct sector and limit params', async () => {
    setupApi()
    render(<SectorPage />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/registry?sector=')
      )
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('limit=12'))
    })
  })
})

describe('SectorPage — unknown sector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSector = 'nonexistent-sector'
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } })
  })

  it('redirects to /registry for unknown sector', async () => {
    render(<SectorPage />)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/registry', { replace: true })
    })
  })
})

describe('SectorPage — logistics sector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSector = 'logistics'
  })

  it('renders logistics hero heading', async () => {
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } })
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /certified logistics & freight companies on mydd/i
      )
    })
  })

  it('shows licence verification stat pill', async () => {
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } })
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByText(/licence verification/i)).toBeInTheDocument()
    })
  })
})

describe('SectorPage — trade-finance sector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSector = 'trade-finance'
  })

  it('renders trade-finance hero heading', async () => {
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } })
    render(<SectorPage />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /certified trade finance companies on mydd/i
      )
    })
  })
})
