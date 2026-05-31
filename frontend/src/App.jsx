import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getSession } from './lib/session'
import api from './lib/api'

// Eager — the two most common entry points (fast first paint, no chunk wait).
import Landing from './pages/Landing'
import Login from './pages/Login'

// Lazy — everything else is code-split into its own chunk and only fetched
// when the route is visited. Keeps the initial bundle small.
const Register        = lazy(() => import('./pages/Register'))
const ForgotPassword  = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword   = lazy(() => import('./pages/ResetPassword'))
const Dashboard       = lazy(() => import('./pages/Dashboard'))
const PACPortal       = lazy(() => import('./pages/PACPortal'))
const TraderPortal    = lazy(() => import('./pages/TraderPortal'))
const AdminPanel      = lazy(() => import('./pages/AdminPanel'))
const Verify          = lazy(() => import('./pages/Verify'))
const CertPrint       = lazy(() => import('./pages/CertPrint'))
const PublicRegistry  = lazy(() => import('./pages/PublicRegistry'))
const PACDirectory    = lazy(() => import('./pages/PACDirectory'))
const PACAgentProfile = lazy(() => import('./pages/PACAgentProfile'))
const NotFound        = lazy(() => import('./pages/NotFound'))
const MissionReport   = lazy(() => import('./pages/MissionReport'))
const VerifyEmail     = lazy(() => import('./pages/VerifyEmail'))
const Legal           = lazy(() => import('./pages/Legal'))
const Support         = lazy(() => import('./pages/Support'))
const Settings        = lazy(() => import('./pages/Settings'))
const SectorPage      = lazy(() => import('./pages/SectorPage'))
const Onboarding      = lazy(() => import('./pages/Onboarding'))

/** Minimal route-transition fallback while a lazy chunk loads. */
function RouteFallback() {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#C9A84C', fontFamily: 'system-ui,sans-serif', fontSize: '0.9rem', background: '#111',
    }}>
      <span aria-busy="true">Chargement…</span>
    </div>
  )
}

/** Requires any authenticated user (session cookie present). */
function PrivateRoute({ children }) {
  return getSession() ? children : <Navigate to="/login" replace />
}

/**
 * Requires a specific role (or one of several roles passed as array).
 * Redirects to /login if not authenticated, /dashboard if wrong role.
 */
function RoleRoute({ role, children }) {
  const user = getSession()
  if (!user) return <Navigate to="/login" replace />
  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  // Seed the CSRF double-submit cookie once on app load so POST/PUT/DELETE
  // requests can immediately read it from document.cookie.
  useEffect(() => {
    api.get('/api/auth/csrf-token').catch(() => { /* non-blocking */ })
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/"                        element={<Landing />} />
          <Route path="/login"                   element={<Login />} />
          <Route path="/register"                element={<Register />} />
          <Route path="/verify-email"            element={<VerifyEmail />} />
          <Route path="/forgot-password"         element={<ForgotPassword />} />
          <Route path="/reset-password/:token"   element={<ResetPassword />} />
          <Route path="/verify/:id"              element={<Verify />} />
          <Route path="/verify/:id/print"        element={<CertPrint />} />
          <Route path="/registry"                element={<PublicRegistry />} />
          <Route path="/agents"                  element={<PACDirectory />} />
          <Route path="/agents/:id"              element={<PACAgentProfile />} />
          <Route path="/privacy"                 element={<Legal tab="privacy" />} />
          <Route path="/terms"                   element={<Legal tab="cgu" />} />
          <Route path="/legal"                   element={<Legal />} />
          <Route path="/support"                 element={<Support />} />
          <Route path="/sectors/:sector"         element={<SectorPage />} />
          <Route path="/onboarding"              element={<PrivateRoute><Onboarding /></PrivateRoute>} />
          <Route path="/settings"                element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/dashboard" element={<RoleRoute role="company"><Dashboard /></RoleRoute>} />
          <Route path="/pac"       element={<RoleRoute role="pac"><PACPortal /></RoleRoute>} />
          <Route path="/pac/missions/:id/report" element={<RoleRoute role="pac"><MissionReport /></RoleRoute>} />
          <Route path="/trader"    element={<RoleRoute role={['trader', 'admin']}><TraderPortal /></RoleRoute>} />
          <Route path="/admin"     element={<RoleRoute role="admin"><AdminPanel /></RoleRoute>} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
