import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { saveSession } from '../lib/session'
import LanguageSwitcher from '../components/LanguageSwitcher'

const ROLE_ROUTE = { pac: '/pac', admin: '/admin', trader: '/trader' }

export default function Login() {
  const { t } = useTranslation()
  useEffect(() => { document.title = 'Sign In — MyDD' }, [])

  const [form,      setForm]      = useState({ email: '', password: '' })
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  // 2FA state
  const [step,      setStep]      = useState('password') // 'password' | 'totp'
  const [tempToken, setTempToken] = useState('')
  const [totpCode,  setTotpCode]  = useState('')
  const totpRef = useRef(null)
  const navigate = useNavigate()

  // Auto-focus TOTP input when step changes
  useEffect(() => {
    if (step === 'totp') setTimeout(() => totpRef.current?.focus(), 50)
  }, [step])

  // ── Step 1: password ───────────────────────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', form)
      if (res.data.requires2fa) {
        setTempToken(res.data.tempToken)
        setStep('totp')
        return
      }
      saveSession(res.data.user)
      navigate(ROLE_ROUTE[res.data.user.role] || '/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || t('login.error_default'))
    } finally { setLoading(false) }
  }

  // ── Step 2: TOTP ───────────────────────────────────────────────────────────
  const handleTotpSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(totpCode)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setLoading(true)
    try {
      const res = await api.post('/api/auth/2fa/validate', { tempToken, token: totpCode })
      saveSession(res.data.user)
      navigate(ROLE_ROUTE[res.data.user.role] || '/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Try again.')
      setTotpCode('')
      totpRef.current?.focus()
    } finally { setLoading(false) }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inp = {
    width: '100%', padding: '0.75rem 1rem',
    background: '#1f1f1f', border: '1px solid #2e2e2e',
    borderRadius: '8px', color: '#fff', fontSize: '0.95rem',
    boxSizing: 'border-box', outline: 'none',
  }
  const lbl = {
    display: 'block', color: '#666', fontSize: '0.75rem',
    fontWeight: '600', marginBottom: '0.4rem',
    letterSpacing: '0.06em', textTransform: 'uppercase',
  }
  const btn = {
    width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)',
    color: '#111', padding: '0.8rem', borderRadius: '8px',
    border: 'none', fontSize: '0.95rem', fontWeight: '700',
    cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
    opacity: loading ? 0.7 : 1,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2.5rem', width: '100%', maxWidth: '420px', boxShadow: '0 0 60px rgba(201,168,76,0.08)' }}>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <LanguageSwitcher />
        </div>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900', color: '#111' }}>M</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#fff' }}>{t('brand.name')}</div>
          </div>
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('brand.tagline')}</div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: email + password ─────────────────────────────────────── */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>{t('login.email')}</label>
              <input
                type="email" style={inp} required autoComplete="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={lbl}>{t('login.password')}</label>
              <input
                type="password" style={inp} required autoComplete="current-password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <button type="submit" disabled={loading} style={btn}>
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        )}

        {/* ── STEP 2: TOTP challenge ───────────────────────────────────────── */}
        {step === 'totp' && (
          <form onSubmit={handleTotpSubmit}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              {/* Shield icon */}
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔐</div>
              <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
                Enter the 6-digit code from your<br />
                <strong style={{ color: '#f5f5f5' }}>authenticator app</strong>
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={lbl}>Authentication code</label>
              <input
                ref={totpRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                autoComplete="one-time-code"
                style={{
                  ...inp,
                  textAlign: 'center',
                  fontSize: '2rem',
                  fontWeight: '700',
                  letterSpacing: '0.4em',
                  paddingLeft: '0.5rem',
                }}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>

            <button type="submit" disabled={loading || totpCode.length !== 6} style={{ ...btn, opacity: (loading || totpCode.length !== 6) ? 0.5 : 1 }}>
              {loading ? 'Verifying…' : 'Confirm'}
            </button>

            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => { setStep('password'); setError(''); setTotpCode('') }}
                style={{ background: 'none', border: 'none', color: '#555', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Back to login
              </button>
            </p>
          </form>
        )}

        {/* Footer links (only on password step) */}
        {step === 'password' && (
          <>
            <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '1rem' }}>
              <Link to="/forgot-password" style={{ color: '#666', fontWeight: '500', textDecoration: 'none', fontSize: '0.8rem' }}>
                {t('forgot_password.title')} →
              </Link>
            </p>
            <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {t('login.no_account')}{' '}
              <Link to="/register" style={{ color: '#C9A84C', fontWeight: '600' }}>{t('login.register_link')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
