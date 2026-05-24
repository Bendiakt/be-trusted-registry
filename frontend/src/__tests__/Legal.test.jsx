/**
 * Tests for Legal page.
 *
 * Covers:
 *  - Defaults to CGU tab (no query param)
 *  - Renders privacy tab when initialTab="privacy" prop is passed
 *  - Tab links point to /terms and /privacy
 *  - Footer contains home link and legal email
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

let mockTab = null

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [{ get: (key) => (key === 'tab' ? mockTab : null) }],
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

import Legal from '../pages/Legal'

describe('Legal', () => {
  beforeEach(() => {
    mockTab = null
    vi.clearAllMocks()
  })

  it('shows CGU content by default (no tab param, no prop)', () => {
    render(<Legal />)
    // CGU content contains the French header text
    expect(screen.getByText("Conditions Générales d'Utilisation")).toBeInTheDocument()
  })

  it('shows Privacy content when initialTab prop is "privacy"', () => {
    render(<Legal tab="privacy" />)
    expect(screen.getByText('Politique de Confidentialité')).toBeInTheDocument()
  })

  it('shows CGU content when initialTab prop is "cgu"', () => {
    render(<Legal tab="cgu" />)
    expect(screen.getByText("Conditions Générales d'Utilisation")).toBeInTheDocument()
  })

  it('shows Privacy content when ?tab=privacy query param is set', () => {
    mockTab = 'privacy'
    render(<Legal />)
    expect(screen.getByText('Politique de Confidentialité')).toBeInTheDocument()
  })

  it('tab link for CGU points to /terms', () => {
    render(<Legal />)
    expect(document.querySelector('a[href="/terms"]')).toBeInTheDocument()
  })

  it('tab link for Privacy points to /privacy', () => {
    render(<Legal />)
    expect(document.querySelector('a[href="/privacy"]')).toBeInTheDocument()
  })

  it('footer has a link to home', () => {
    render(<Legal />)
    expect(document.querySelector('a[href="/"]')).toBeInTheDocument()
  })

  it('footer has legal email link', () => {
    render(<Legal />)
    expect(document.querySelector('a[href="mailto:legal@mydd.work"]')).toBeInTheDocument()
  })
})
