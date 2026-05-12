import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || ''

// ── Axios instance — cookies sent automatically via withCredentials ───────────
// httpOnly cookies (token, refresh_token) are managed by the browser.
// The frontend never reads or writes them — they are invisible to JS.
const api = axios.create({ baseURL, withCredentials: true })

// ── CSRF double-submit cookie helper ─────────────────────────────────────────
// Reads the non-httpOnly `csrf_token` cookie set by GET /api/auth/csrf-token
// and injects it as a header on every mutating request.
const getCsrfToken = () => {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase()
  const SAFE = ['GET', 'HEAD', 'OPTIONS']
  if (!SAFE.includes(method)) {
    const csrf = getCsrfToken()
    if (csrf) {
      config.headers = config.headers || {}
      config.headers['X-CSRF-Token'] = csrf
    }
  }
  return config
})

// ── Silent token refresh on 401 ─────────────────────────────────────────────
// Pattern: queue concurrent 401s, attempt one cookie-based refresh, replay all.
let isRefreshing = false
let failedQueue = []

const processQueue = (error) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()))
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Only intercept 401s that haven't already been retried and are not the
    // refresh endpoint itself (prevents infinite retry loop).
    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.includes('/api/auth/refresh')
    ) {
      return Promise.reject(error)
    }

    // Never redirect unauthenticated users away from public endpoints
    const PUBLIC_PREFIXES = ['/api/registry', '/api/verify/']
    const isPublicEndpoint = PUBLIC_PREFIXES.some((p) => original.url?.includes(p))
    if (isPublicEndpoint) return Promise.reject(error)

    if (isRefreshing) {
      // Another refresh is in flight — queue this request until it resolves.
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then(() => api(original))
        .catch((err) => Promise.reject(err))
    }

    original._retry = true
    isRefreshing = true

    try {
      // Cookie-based refresh: no body needed — the browser sends the httpOnly
      // refresh_token cookie automatically (path: /api/auth/refresh).
      await axios.post(baseURL + '/api/auth/refresh', {}, { withCredentials: true })
      processQueue(null)
      return api(original)
    } catch (refreshError) {
      processQueue(refreshError)
      // Both tokens expired/revoked — force re-login
      window.location.replace('/login')
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default api
