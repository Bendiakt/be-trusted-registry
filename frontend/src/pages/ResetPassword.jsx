import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ResetPassword() {
  const { t } = useTranslation()
  const { token } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError(t('reset_password.error_mismatch')); return }
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { token, password: form.password })
      // Brief success flash, then redirect to login
      setTimeout(() => navigate('/login'), 2000)
      setError('__success__')
    } catch (err) {
      const msg = err.response?.data?.error || ''
      if (msg.includes('invalid') || msg.includes('expired')) {
        setError(t('reset_password.error_expired'))
      } else {
        setError(t('reset_password.error_default'))
      }
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
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('reset_password.title')}</div>
        </div>

        {error === '__success__' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            <div style={{ background: 'rgba(46,204,113,0.12)', border: '1px solid rgba(46,204,113,0.4)', color: '#2ecc71', padding: '1rem', borderRadius: '8px', fontSize: '0.875rem', lineHeight: '1.5' }}>
              {t('reset_password.success')}
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={lbl}>{t('reset_password.new_password')}</label>
                <input
                  type="password"
                  style={inp}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={lbl}>{t('reset_password.confirm_password')}</label>
                <input
                  type="password"
                  style={inp}
                  value={form.confirm}
                  onChange={e => setForm({ ...form, confirm: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.8rem', borderRadius: '8px', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                {loading ? t('reset_password.submitting') : t('reset_password.submit')}
              </button>
            </form>

            <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '1.5rem' }}>
              <Link to="/login" style={{ color: '#C9A84C', fontWeight: '600', textDecoration: 'none' }}>
                ← {t('reset_password.back_to_login')}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
