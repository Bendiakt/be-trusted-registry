'use strict'

import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport is ≤ breakpoint px wide.
 * Safe in test environments where window.matchMedia may be absent.
 *
 * @param {number} breakpoint  — default 640 (standard "sm" breakpoint)
 */
export function useMobile (breakpoint = 640) {
  const getMatch = () => {
    if (typeof window === 'undefined') return false
    if (!window.matchMedia) return window.innerWidth <= breakpoint
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  }

  const [isMobile, setIsMobile] = useState(getMatch)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}
