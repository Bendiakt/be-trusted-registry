import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ForgotPassword() {
  const { t } = useTranslation()
  useEffect(() => { document.title = 'Forgot Password — MyDD' }, [])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/api/auth/forgot-password', { email })
      setDone(true)
    } catch {
      setError(t('forgot_password.error_default'))
    } finally { setLoading(false) }
  }

  const inp = { width: '100%', padding: '0.75rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }
  const lbl = { display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2.5rem', width: '100%', maxWidth: '420px', boxShadow: '0 0 60px rgba(201,168,76,0.08)' }}>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <LanguageSwitcher />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900', color: '#111' }}>M</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#fff' }}>{t('brand.name')}</div>
          </div>
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('forgot_password.title')}</div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📧</div>
            <div style={{ background: 'rgba(46,204,113,0.12)', border: '1px solid rgba(46,204,113,0.4)', color: '#2ecc71', padding: '1rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              {t('forgot_password.success')}
            </div>
            <Link to="/login" style={{ color: '#C9A84C', fontSize: '0.85rem', fontWeight: '600', textDecoration: 'none' }}>
              ← {t('forgot_password.back_to_login')}
            </Link>
          </div>
        ) : (
          <>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.5', textAlign: 'center' }}>
              {t('forgot_password.subtitle')}
            </div>

            {error && (
              <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="forgot-email" style={lbl}>{t('forgot_password.email')}</label>
                <input
                  id="forgot-email"
                  type="email"
                  style={inp}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.8rem', borderRadius: '8px', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                {loading ? t('forgot_password.submitting') : t('forgot_password.submit')}
              </button>
            </form>

            <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '1.5rem' }}>
              <Link to="/login" style={{ color: '#C9A84C', fontWeight: '600', textDecoration: 'none' }}>
                ← {t('forgot_password.back_to_login')}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
