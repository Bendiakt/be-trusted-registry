import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

const PLANS = [
  { id: 'level1', name: 'Bronze Certification', price: '$490', features: ['Basic registry listing', 'Certification badge', 'Email verification', 'Valid 12 months'] },
  { id: 'level2', name: 'Silver Certification', price: '$990', features: ['Everything in Bronze', 'Document verification', 'Priority listing', 'B&E Audit report', 'Valid 12 months'] },
  { id: 'level3', name: 'Gold Certification', price: '$2,490', features: ['Everything in Silver', 'On-site audit', 'Top registry placement', 'Dedicated account manager', 'PAC portal access', 'Valid 12 months'] },
]

const LEVEL_CONFIG = {
  0: { label: 'Unverified', color: '#666', bg: 'rgba(102,102,102,0.1)' },
  1: { label: 'Bronze Certified', color: '#CD7F32', bg: 'rgba(205,127,50,0.1)' },
  2: { label: 'Silver Certified', color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)' },
  3: { label: 'Gold Certified', color: '#C9A84C', bg: 'rgba(201,168,76,0.15)' },
}

export default function Dashboard() {
  const [tab, setTab] = useState('overview')
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [paymentError, setPaymentError] = useState('')
  const [checkoutPlanId, setCheckoutPlanId] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    const role = localStorage.getItem('role')
    if (!token) { navigate('/login'); return }
    if (role === 'pac') { navigate('/pac'); return }
    fetchProfile(token)
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') setTab('overview')
  }, [])

  const fetchProfile = async (token) => {
    try {
      const res = await api.get('/api/companies/me', { headers: { Authorization: 'Bearer ' + token } })
      setCompany(res.data.company)
      setUser(res.data.user)
    } catch {
      navigate('/login')
    }
  }

  const handleCheckout = async (planId) => {
    setPaymentError('')
    setCheckoutPlanId(planId)
    try {
      const token = localStorage.getItem('token')
      const res = await api.post('/api/payments/create-checkout-session', { planId }, { headers: { Authorization: 'Bearer ' + token } })
      window.location.href = res.data.url
    } catch (err) {
      setPaymentError(err.response?.data?.error || 'Payment initialization failed. Please try again.')
    } finally {
      setCheckoutPlanId('')
    }
  }

  const handleLogout = () => {
    localStorage.clear()
    navigate('/login')
  }

  const G = {
    page: { minHeight: '100vh', background: '#111', fontFamily: 'sans-serif', color: '#eee' },
    nav: { background: '#1a1a1a', borderBottom: '1px solid #333', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' },
    logo: { color: '#C9A84C', fontWeight: '900', fontSize: '1.2rem', letterSpacing: '0.1em' },
    main: { maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' },
    card: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' },
    tabs: { display: 'flex', gap: '0.5rem', marginBottom: '2rem' },
    planCard: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', flex: '1', minWidth: '240px', display: 'flex', flexDirection: 'column' },
    btn: { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.6rem 1.2rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.875rem' },
    outlineBtn: { background: 'transparent', color: '#C9A84C', padding: '0.6rem 1.2rem', borderRadius: '6px', border: '1px solid #C9A84C', fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem' },
  }

  const lvl = company?.certificationLevel || 0
  const lconf = LEVEL_CONFIG[lvl]

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={tab === id ? { ...G.btn } : { ...G.outlineBtn }}>
      {label}
    </button>
  )

  return (
    <div style={G.page}>
      <nav style={G.nav}>
        <div style={G.logo}>B&amp;E TRUSTED REGISTRY</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#888', fontSize: '0.875rem' }}>{user?.email}</span>
          <button onClick={handleLogout} style={{ ...G.outlineBtn, padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>Logout</button>
        </div>
      </nav>

      <main style={G.main}>
        <div style={G.tabs}>
          <TabBtn id="overview" label="Overview" />
          <TabBtn id="register" label="Register Company" />
          <TabBtn id="pricing" label="Pricing &amp; Upgrade" />
        </div>

        {tab === 'overview' && (
          <div>
            <div style={G.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>{company?.name || 'Your Company'}</div>
                  <div style={{ color: '#888', fontSize: '0.875rem' }}>{company?.industry || 'Industry not set'}</div>
                </div>
                <div style={{ background: lconf.bg, border: '1px solid ' + lconf.color, borderRadius: '20px', padding: '0.35rem 1rem', color: lconf.color, fontWeight: '600', fontSize: '0.875rem' }}>
                  {lconf.label}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
              {[
                { label: 'Certification Level', value: lvl > 0 ? 'Level ' + lvl : 'None', color: lconf.color },
                { label: 'Registry Status', value: company ? 'Active' : 'Not Registered', color: '#4CAF50' },
                { label: 'Verification', value: company?.verified ? 'Verified' : 'Pending', color: company?.verified ? '#4CAF50' : '#888' },
              ].map(item => (
                <div key={item.label} style={G.card}>
                  <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                  <div style={{ color: item.color, fontSize: '1.25rem', fontWeight: '700' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {lvl === 0 && (
              <div style={{ ...G.card, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.3)', marginTop: '1rem' }}>
                <div style={{ color: '#C9A84C', fontWeight: '600', marginBottom: '0.5rem' }}>Get Certified</div>
                <div style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>Choose a certification level to appear in the B&amp;E Trusted Registry and unlock supplier access from verified traders.</div>
                <button style={G.btn} onClick={() => setTab('pricing')}>View Certification Plans</button>
              </div>
            )}
          </div>
        )}

        {tab === 'register' && (
          <RegisterCompanyForm company={company} onSaved={(c) => { setCompany(c); setTab('overview') }} />
        )}

        {tab === 'pricing' && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Certification Plans</div>
              <div style={{ color: '#888', fontSize: '0.875rem' }}>Annual certification valid for 12 months. One-time payment.</div>
            </div>
            {!company && (
              <div style={{ ...G.card, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.35)', marginBottom: '1rem' }}>
                <div style={{ color: '#C9A84C', fontWeight: '700', marginBottom: '0.4rem' }}>Complete your company profile first</div>
                <div style={{ color: '#aaa', fontSize: '0.875rem' }}>Checkout is enabled after saving your company profile in the Register Company tab.</div>
              </div>
            )}
            {paymentError && (
              <div style={{ ...G.card, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.35)', marginBottom: '1rem', color: '#ff7f7f' }}>
                {paymentError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {PLANS.map((plan, i) => (
                <div key={plan.id} style={{ ...G.planCard, ...(i === 2 ? { border: '1px solid #C9A84C', boxShadow: '0 0 20px rgba(201,168,76,0.15)' } : {}) }}>
                  {i === 2 && <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>MOST POPULAR</div>}
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.25rem' }}>{plan.name}</div>
                  <div style={{ fontSize: '2rem', fontWeight: '900', color: '#C9A84C', marginBottom: '1rem' }}>
                    {plan.price}<span style={{ fontSize: '0.875rem', color: '#666', fontWeight: '400' }}>/yr</span>
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ color: '#bbb', fontSize: '0.875rem', padding: '0.3rem 0', borderBottom: '1px solid #2a2a2a' }}>
                        <span style={{ color: '#C9A84C', marginRight: '0.5rem' }}>&#10003;</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button
                    style={{ ...G.btn, opacity: lvl >= (i + 1) || !company ? 0.5 : 1, cursor: lvl >= (i + 1) || !company ? 'default' : 'pointer' }}
                    onClick={() => lvl < (i + 1) && company && handleCheckout(plan.id)}
                    disabled={lvl >= (i + 1) || !company || checkoutPlanId === plan.id}
                  >
                    {checkoutPlanId === plan.id ? 'Redirecting...' : (lvl >= (i + 1) ? 'Current Plan' : 'Get Certified')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function RegisterCompanyForm({ company, onSaved }) {
  const [form, setForm] = useState({
    name: company?.name || '',
    industry: company?.industry || '',
    country: company?.country || '',
    description: company?.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setMsg('')
    try {
      const token = localStorage.getItem('token')
      const res = await api.post('/api/companies/register', form, { headers: { Authorization: 'Bearer ' + token } })
      setMsg('Saved successfully')
      onSaved(res.data.company)
    } catch (err) {
      setMsg(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const G = {
    card: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', maxWidth: '600px' },
    lbl: { display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#888', marginBottom: '0.35rem', letterSpacing: '0.05em', textTransform: 'uppercase' },
    inp: { width: '100%', padding: '0.65rem 1rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', marginBottom: '1rem', boxSizing: 'border-box' },
    btn: { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.7rem 1.5rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer' },
  }

  return (
    <div style={G.card}>
      <div style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>Company Profile</div>
      {msg && <div style={{ marginBottom: '1rem', color: msg.includes('success') ? '#4CAF50' : '#ff6b6b', fontSize: '0.875rem' }}>{msg}</div>}
      <form onSubmit={handleSubmit}>
        <label style={G.lbl}>Company Name</label>
        <input style={G.inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <label style={G.lbl}>Industry</label>
        <input style={G.inp} value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Manufacturing, Trading" />
        <label style={G.lbl}>Country</label>
        <input style={G.inp} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
        <label style={G.lbl}>Description</label>
        <textarea style={{ ...G.inp, minHeight: '80px', resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <button style={G.btn} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
      </form>
    </div>
  )
}
