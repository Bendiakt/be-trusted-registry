/**
 * Smoke test for the Skeleton component.
 * Verifies it renders and accepts props without crashing.
 */
import { render } from '@testing-library/react'
import Skeleton from '../components/Skeleton'

describe('Skeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('applies custom width and height via inline style', () => {
    const { container } = render(<Skeleton width="200px" height="40px" />)
    const el = container.firstChild
    expect(el.style.width).toBe('200px')
    expect(el.style.height).toBe('40px')
  })

  it('defaults to 100% width and 1rem height', () => {
    const { container } = render(<Skeleton />)
    const el = container.firstChild
    expect(el.style.width).toBe('100%')
    expect(el.style.height).toBe('1rem')
  })

  it('applies a custom border radius', () => {
    const { container } = render(<Skeleton radius="50%" />)
    expect(container.firstChild.style.borderRadius).toBe('50%')
  })
})
