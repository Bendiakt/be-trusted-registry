/**
 * lib/session.js — client-side session helpers.
 *
 * With httpOnly-cookie auth the JWT token is invisible to JS.
 * We store only the non-secret user metadata (id, name, email, role)
 * in sessionStorage so the frontend can make routing decisions without
 * reading the token.
 *
 * sessionStorage is scoped to the tab and cleared on close — safer than
 * localStorage for identity data.
 *
 * Authentication state is ultimately controlled by the httpOnly cookie;
 * this cache is just a convenience layer for the UI.
 */

const KEY = 'mydd_user'

/** Persist user info returned by /api/auth/login or /api/auth/refresh. */
export const saveSession = (user) => {
  if (!user) return
  sessionStorage.setItem(KEY, JSON.stringify({
    id:    user.id,
    name:  user.name  || '',
    email: user.email || '',
    role:  user.role  || 'company',
  }))
}

/**
 * Return the cached user object, or null if no session exists.
 * Never throws.
 */
export const getSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

/** Remove the client-side session cache (call on logout). */
export const clearSession = () => {
  sessionStorage.removeItem(KEY)
}
