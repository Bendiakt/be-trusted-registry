/**
 * Skeleton.test.jsx — Unit tests for the Skeleton placeholder component.
 */
import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import Skeleton from './Skeleton'

describe('Skeleton — default props', () => {
  test('renders a div element', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild.tagName).toBe('DIV')
  })

  test('default width is 100%', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild.style.width).toBe('100%')
  })

  test('default height is 1rem', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild.style.height).toBe('1rem')
  })

  test('default border-radius is 6px', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild.style.borderRadius).toBe('6px')
  })
})

describe('Skeleton — custom props', () => {
  test('applies custom width', () => {
    const { container } = render(<Skeleton width="200px" />)
    expect(container.firstChild.style.width).toBe('200px')
  })

  test('applies custom height', () => {
    const { container } = render(<Skeleton height="3rem" />)
    expect(container.firstChild.style.height).toBe('3rem')
  })

  test('applies custom border-radius', () => {
    const { container } = render(<Skeleton radius="50%" />)
    expect(container.firstChild.style.borderRadius).toBe('50%')
  })

  test('merges extra styles without overriding required ones', () => {
    const { container } = render(<Skeleton style={{ marginTop: '1rem' }} />)
    expect(container.firstChild.style.marginTop).toBe('1rem')
    expect(container.firstChild.style.width).toBe('100%')
  })
})
