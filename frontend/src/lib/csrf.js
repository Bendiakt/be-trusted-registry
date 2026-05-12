/**
 * lib/csrf.js — Extracted CSRF token reader so it can be unit-tested.
 *
 * Reads the non-httpOnly `csrf_token` cookie injected by
 * GET /api/auth/csrf-token and returns its value (or null).
 */
export const getCsrfToken = () => {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}
