import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Register() {
  const { t } = useTranslation()
  useEffect(() => { document.title = 'Create Account — MyDD' }, [])
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'company' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/api/auth/register', form)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || t('register.error_default'))
    } finally { setLoading(false) }
  }

  const roles = [
    { value: 'company', label: t('register.roles.company_label'), desc: t('register.roles.company_desc'), icon: '🏢' },
    { value: 'trader',  label: t('register.roles.trader_label'),  desc: t('register.roles.trader_desc'),  icon: '📊' },
    { value: 'pac',     label: t('register.roles.pac_label'),     desc: t('register.roles.pac_desc'),     icon: '🔍' },
  ]

  const inp = { width: '100%', padding: '0.75rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }
  const lbl = { display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2.5rem', width: '100%', maxWidth: '460px', boxShadow: '0 0 60px rgba(201,168,76,0.08)' }}>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <LanguageSwitcher />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900', color: '#111' }}>M</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff' }}>{t('brand.name')}</div>
          </div>
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('register.title')}</div>
        </div>

        {error && <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>{t('register.full_name')}</label>
            <input type="text" style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>{t('register.email')}</label>
            <input type="email" style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={lbl}>{t('register.password')}</label>
            <input type="password" style={inp} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ ...lbl, marginBottom: '0.75rem' }}>{t('register.role_label')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {roles.map(r => (
                <div
                  key={r.value}
                  onClick={() => setForm({ ...form, role: r.value })}
                  style={{ padding: '0.75rem 1rem', background: form.role === r.value ? 'rgba(201,168,76,0.12)' : '#1f1f1f', border: form.role === r.value ? '1px solid #C9A84C' : '1px solid #2e2e2e', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{r.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: form.role === r.value ? '#C9A84C' : '#ccc', fontWeight: '600', fontSize: '0.9rem' }}>{r.label}</div>
                    <div style={{ color: '#555', fontSize: '0.78rem', marginTop: '0.1rem' }}>{r.desc}</div>
                  </div>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: form.role === r.value ? 'none' : '1px solid #444', background: form.role === r.value ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : 'transparent', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.8rem', borderRadius: '8px', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.04em' }}>
            {loading ? t('register.submitting') : t('register.submit')}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '1.5rem' }}>
          {t('register.already_registered')} <Link to="/login" style={{ color: '#C9A84C', fontWeight: '600' }}>{t('register.sign_in')}</Link>
        </p>
      </div>
    </div>
  )
}
