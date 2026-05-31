/**
 * Tests for the Support page.
 *
 * Covers:
 *  - Renders the three contact channels
 *  - Renders the SLA table (incl. the RGPD row)
 *  - Surfaces the self-service data-export endpoint
 *  - Links to /privacy, /terms and home
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

import Support from '../pages/Support'

describe('Support', () => {
  it('renders the three contact email channels', () => {
    render(<Support />)
    // emails appear in the table and again in the footer / RGPD section
    expect(screen.getAllByText('support@mydd.work').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('privacy@mydd.work').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('legal@mydd.work').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the SLA table including the RGPD response window', () => {
    render(<Support />)
    expect(screen.getByText(/Délais de réponse/i)).toBeInTheDocument()
    expect(screen.getByText(/Accusé sous 3 j · réponse 30 j/)).toBeInTheDocument()
  })

  it('surfaces the self-service GDPR data-export endpoint', () => {
    render(<Support />)
    expect(screen.getByText('/api/auth/me/export')).toBeInTheDocument()
  })

  it('links to privacy, terms and home', () => {
    const { container } = render(<Support />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/terms')
    expect(hrefs).toContain('/')
  })
})
