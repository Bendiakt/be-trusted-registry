/**
 * Tests for NotFound (404) page.
 *
 * Covers:
 *  - Renders "404" text
 *  - Renders i18n title and description keys
 *  - Home link present
 *  - Registry link present
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

import NotFound from '../pages/NotFound'

describe('NotFound', () => {
  beforeEach(() => {
    render(<NotFound />)
  })

  it('displays the 404 number', () => {
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('renders i18n title key', () => {
    expect(screen.getByText('not_found.title')).toBeInTheDocument()
  })

  it('renders i18n description key', () => {
    expect(screen.getByText('not_found.description')).toBeInTheDocument()
  })

  it('has a link to home (/)', () => {
    expect(document.querySelector('a[href="/"]')).toBeInTheDocument()
  })

  it('has a link to /registry', () => {
    expect(document.querySelector('a[href="/registry"]')).toBeInTheDocument()
  })
})
