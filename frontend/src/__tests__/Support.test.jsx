/**
 * Tests for the Support page.
 *
 * Covers:
 *  - Renders the three contact channels
 *  - Renders the SLA table (incl. the GDPR row)
 *  - Renders the GDPR-rights section
 *  - Links to /privacy, /terms and home
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

// Resolve i18n keys against the real English locale so assertions stay readable.
import en from '../locales/en.json'
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), en) ?? key }),
}))

import Support from '../pages/Support'

describe('Support', () => {
  it('renders the three contact email channels', () => {
    render(<Support />)
    // emails appear in the table and again in the footer
    expect(screen.getAllByText('support@mydd.work').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('privacy@mydd.work').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('legal@mydd.work').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the SLA table including the GDPR response window', () => {
    render(<Support />)
    expect(screen.getByText(en.support.sla_heading)).toBeInTheDocument()
    expect(screen.getByText(en.support.sla_gdpr)).toBeInTheDocument()
  })

  it('renders the GDPR-rights section', () => {
    render(<Support />)
    expect(screen.getByRole('heading', { name: en.support.rgpd_heading })).toBeInTheDocument()
    expect(screen.getByText(en.support.rgpd_access_label)).toBeInTheDocument()
  })

  it('links to privacy, terms and home', () => {
    const { container } = render(<Support />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/terms')
    expect(hrefs).toContain('/')
  })
})
