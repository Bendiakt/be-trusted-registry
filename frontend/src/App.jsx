import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import NotFound from './pages/NotFound'
import MissionReport from './pages/MissionReport'
import VerifyEmail from './pages/VerifyEmail'

/**
 * Decode the JWT payload stored in localStorage without a library.
 * Returns null if the token is missing, malformed, or expired.
 */
function getTokenPayload() {
  try {
    const token = localStorage.getItem('token')
    if (!token) return null
    const base64 = token.split('.')[1]
    if (!base64) return null
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json)
    // Reject if token is already expired on the client side
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** Requires any authenticated user. */
function PrivateRoute({ children }) {
  return getTokenPayload() ? children : <Navigate to="/login" replace />
}

/**
 * Requires a specific role (or one of several roles passed as array).
 * Redirects to /login if not authenticated, /dashboard if wrong role.
 */
function RoleRoute({ role, children }) {
  const payload = getTokenPayload()
  if (!payload) return <Navigate to="/login" replace />
  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(payload.role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
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
