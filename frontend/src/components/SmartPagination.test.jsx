/**
 * SmartPagination.test.jsx — Unit tests for the SmartPagination component.
 *
 * Tests rendering logic, windowing algorithm, and callback firing.
 * No network, no router — pure UI unit tests.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SmartPagination from './SmartPagination'

// Minimal i18n mock — SmartPagination uses t('pagination.total_count')
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => opts?.count != null ? `${opts.count} results` : key,
  }),
}))

describe('SmartPagination — no render cases', () => {
  test('renders nothing when pages is 0', () => {
    const { container } = render(<SmartPagination page={1} pages={0} total={0} onPage={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  test('renders nothing when pages is 1', () => {
    const { container } = render(<SmartPagination page={1} pages={1} total={5} onPage={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  test('renders nothing when pages is undefined', () => {
    const { container } = render(<SmartPagination page={1} onPage={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SmartPagination — page buttons', () => {
  test('renders page buttons for 3 pages', () => {
    render(<SmartPagination page={2} pages={3} total={30} onPage={() => {}} />)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  test('current page button is visually distinct (bold)', () => {
    render(<SmartPagination page={2} pages={3} total={30} onPage={() => {}} />)
    const activeBtn = screen.getByText('2')
    expect(activeBtn.style.fontWeight).toBe('700')
  })

  test('non-active page buttons have fontWeight 400', () => {
    render(<SmartPagination page={1} pages={3} total={30} onPage={() => {}} />)
    const btn2 = screen.getByText('2')
    expect(btn2.style.fontWeight).toBe('400')
  })
})

describe('SmartPagination — windowing', () => {
  test('shows at most 9 consecutive page buttons', () => {
    render(<SmartPagination page={10} pages={20} total={200} onPage={() => {}} />)
    // Should show pages 6-14 (9 buttons) + "1 …" + "… 20" shortcuts
    const buttons = screen.getAllByRole('button')
    // 9 range buttons + 2 shortcut buttons = 11 total
    expect(buttons.length).toBeLessThanOrEqual(11)
  })

  test('shows "1 …" shortcut when window does not include page 1', () => {
    render(<SmartPagination page={10} pages={20} total={200} onPage={() => {}} />)
    expect(screen.getByText('1 …')).toBeTruthy()
  })

  test('shows "… N" shortcut when window does not include last page', () => {
    render(<SmartPagination page={10} pages={20} total={200} onPage={() => {}} />)
    expect(screen.getByText('… 20')).toBeTruthy()
  })

  test('no "1 …" shortcut when window includes page 1', () => {
    render(<SmartPagination page={1} pages={5} total={50} onPage={() => {}} />)
    expect(screen.queryByText('1 …')).toBeNull()
  })
})

describe('SmartPagination — callbacks', () => {
  test('calls onPage with correct page number when a button is clicked', () => {
    const onPage = vi.fn()
    render(<SmartPagination page={1} pages={5} total={50} onPage={onPage} />)
    fireEvent.click(screen.getByText('3'))
    expect(onPage).toHaveBeenCalledWith(3)
  })

  test('calls onPage(1) when "1 …" shortcut is clicked', () => {
    const onPage = vi.fn()
    render(<SmartPagination page={10} pages={20} total={200} onPage={onPage} />)
    fireEvent.click(screen.getByText('1 …'))
    expect(onPage).toHaveBeenCalledWith(1)
  })

  test('calls onPage(N) when "… N" shortcut is clicked', () => {
    const onPage = vi.fn()
    render(<SmartPagination page={10} pages={20} total={200} onPage={onPage} />)
    fireEvent.click(screen.getByText('… 20'))
    expect(onPage).toHaveBeenCalledWith(20)
  })
})

describe('SmartPagination — total count display', () => {
  test('shows total count label when total is provided', () => {
    render(<SmartPagination page={1} pages={3} total={42} onPage={() => {}} />)
    expect(screen.getByText('42 results')).toBeTruthy()
  })

  test('hides count when total is null', () => {
    render(<SmartPagination page={1} pages={3} total={null} onPage={() => {}} />)
    expect(screen.queryByText(/results/)).toBeNull()
  })
})
