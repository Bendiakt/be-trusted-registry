import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { saveSession } from '../lib/session'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { t } = useTranslation()
  useEffect(() => { document.title = 'Sign In — MyDD' }, [])
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', form)
      saveSession(res.data.user)
      const role = res.data.user.role
      if (role === 'pac')   navigate('/pac')
      else if (role === 'admin')  navigate('/admin')
      else if (role === 'trader') navigate('/trader')
      else navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || t('login.error_default'))
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
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('brand.tagline')}</div>
        </div>

        {error && <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>{t('login.email')}</label>
            <input type="email" style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={lbl}>{t('login.password')}</label>
            <input type="password" style={inp} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.8rem', borderRadius: '8px', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.04em' }}>
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '1rem' }}>
          <Link to="/forgot-password" style={{ color: '#666', fontWeight: '500', textDecoration: 'none', fontSize: '0.8rem' }}>{t('forgot_password.title')} →</Link>
        </p>
        <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {t('login.no_account')} <Link to="/register" style={{ color: '#C9A84C', fontWeight: '600' }}>{t('login.register_link')}</Link>
        </p>
      </div>
    </div>
  )
}
