import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'company' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await axios.post('/api/auth/register', form)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  const roles = [
    { value: 'company', label: '🏢 Company', desc: 'Get your company certified' },
    { value: 'trader', label: '📊 Trader', desc: 'Verify your suppliers' },
    { value: 'pac', label: '🔍 PAC Agent', desc: 'Conduct site inspections' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2.5rem', width: '100%', maxWidth: '460px', boxShadow: '0 0 60px rgba(201,168,76,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900', color: '#111' }}>M</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff' }}>MyDD</div>
          </div>
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Create your account</div>
        </div>

        {error && <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Full Name / Company</label>
            <input type="text" style={{ width: '100%', padding: '0.75rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Email</label>
            <input type="email" style={{ width: '100%', padding: '0.75rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Password</label>
            <input type="password" style={{ width: '100%', padding: '0.75rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>I am registering as...</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {roles.map(r => (
                <div
                  key={r.value}
                  onClick={() => setForm({ ...form, role: r.value })}
                  style={{ padding: '0.75rem 1rem', background: form.role === r.value ? 'rgba(201,168,76,0.12)' : '#1f1f1f', border: form.role === r.value ? '1px solid #C9A84C' : '1px solid #2e2e2e', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ color: form.role === r.value ? '#C9A84C' : '#ccc', fontWeight: '600', fontSize: '0.9rem' }}>{r.label}</div>
                    <div style={{ color: '#555', fontSize: '0.78rem', marginTop: '0.1rem' }}>{r.desc}</div>
                  </div>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: form.role === r.value ? 'none' : '1px solid #444', background: form.role === r.value ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : 'transparent' }} />
                </div>
              ))}
            </div>
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.8rem', borderRadius: '8px', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.04em' }}>
            {loading ? 'Creating account...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem', marginTop: '1.5rem' }}>
          Already registered? <Link to="/login" style={{ color: '#C9A84C', fontWeight: '600' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
