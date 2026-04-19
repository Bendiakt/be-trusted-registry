import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL })

// ── Auto-inject token from localStorage on every request ────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers || {}
    config.headers['Authorization'] = 'Bearer ' + token
  }
  return config
})

// ── Silent token refresh on 401 ─────────────────────────────────────────────
// Pattern: queue concurrent 401s, attempt one refresh, replay all on success.

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)))
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

    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) {
      localStorage.clear()
      window.location.replace('/login')
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Another refresh is in flight — queue this request until it resolves.
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then((token) => {
          original.headers['Authorization'] = 'Bearer ' + token
          return api(original)
        })
        .catch((err) => Promise.reject(err))
    }

    original._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post(baseURL + '/api/auth/refresh', { refreshToken })
      const newToken = data.token
      localStorage.setItem('token', newToken)
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
      api.defaults.headers.common['Authorization'] = 'Bearer ' + newToken
      processQueue(null, newToken)
      original.headers['Authorization'] = 'Bearer ' + newToken
      return api(original)
    } catch (refreshError) {
      processQueue(refreshError, null)
      localStorage.clear()
      window.location.replace('/login')
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default api
