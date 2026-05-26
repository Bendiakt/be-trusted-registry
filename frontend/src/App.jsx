import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getSession } from './lib/session'
import api from './lib/api'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import PACPortal from './pages/PACPortal'
import TraderPortal from './pages/TraderPortal'
import AdminPanel from './pages/AdminPanel'
import Verify from './pages/Verify'
import CertPrint from './pages/CertPrint'
import Landing from './pages/Landing'
import PublicRegistry from './pages/PublicRegistry'
import PACDirectory from './pages/PACDirectory'
import PACAgentProfile from './pages/PACAgentProfile'
import NotFound from './pages/NotFound'
import MissionReport from './pages/MissionReport'
import VerifyEmail from './pages/VerifyEmail'
import Legal from './pages/Legal'

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
        <Route path="/dashboard" element={<RoleRoute role="company"><Dashboard /></RoleRoute>} />
        <Route path="/pac"       element={<RoleRoute role="pac"><PACPortal /></RoleRoute>} />
        <Route path="/pac/missions/:id/report" element={<RoleRoute role="pac"><MissionReport /></RoleRoute>} />
        <Route path="/trader"    element={<RoleRoute role={['trader', 'admin']}><TraderPortal /></RoleRoute>} />
        <Route path="/admin"     element={<RoleRoute role="admin"><AdminPanel /></RoleRoute>} />
        <Route path="*"          element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
