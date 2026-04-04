import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const PLANS = [
  { id: 'level1', name: 'LEVEL 1', subtitle: 'Document Verification', price: 490, features: ['Legal document review', 'Registration check', 'Sanctions screening', 'Digital badge', 'Valid 12 months'] },
  { id: 'level2', name: 'LEVEL 2', subtitle: 'KYC Full Validation', price: 990, features: ['Everything in Level 1', 'UBO verification', 'Financial statements', 'Bank reference check', 'AML compliance', 'Gold badge'] },
  { id: 'level3', name: 'LEVEL 3', subtitle: 'Physical Site Inspection', price: 2490, features: ['Everything in Level 2', 'PAC agent on-site visit', 'Facility audit', 'Operations review', 'Premium certificate', 'Priority listing'] },
]

const LEVEL_CONFIG = {
  0: { label: 'NOT CERTIFIED', color: '#666', bg: 'rgba(100,100,100,0.1)', border: '#444', icon: '○' },
  1: { label: 'LEVEL 1 — DOCUMENT VERIFIED', color: '#C9A84C', bg: '  1: { l,168,  1: { label: 'LEVEL 1 — DOCUMENT VERIFIED', color: '#C9'LEVEL 2 — KYC VALIDATED', color: '#E8C96D', bg: 'rgba(232,201,109,0.15)', border: '#E8C96D', icon: '★' },
  3: { label: 'LEVEL 3 — SITE INSPECTED', color: '#2ecc71', bg: 'rgba(46,204,113,0.1)', border: '#2ecc71', icon: '✔' },
}

export default function Dashboard() {
  const [company, setCompany] = useState(null)
  const [form, setForm] = useState({ companyName: '', country: '', sector: '', website: '' })
  const [tab, setTab] = useState('overview')
  const [msg, setMsg] = useState('')
  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [payLoadin  const [pay .then(res => setCompany(res.data)).catch(() => {})
  }, [])

  const handleApply = async (e) => {
    e.preventDefault()
    try {
      const res = await axios.post('/api/companies/apply', form, { headers: { Authorization: `Bearer ${token}` } })
      setCompany(res.data); setMsg('Application submitted!'); setTab('overview')
    } catch (err) { setMsg(err.response?.data?.error || 'Error') }
  }

  const handleCheckout = async (planId) => {
    setPayLoading(planId)
    try {
      const res = await axios.post('/api/payments/checkout', { planId, companyId: company?.id }, { headers: { Authorization: `Bearer ${token}` } })
      if (res.data.url) window.location.href = res.data.url
    } catch (err) { alert(err.response?.data?.error || 'Payment error. Please try again.    } catch (err) { alert(err.response?.data?.error || 'Payment error. Please try again.    } catch (err) { alert(err.response?.data?.error || 'Payment error. Please try again.    } catch (err) { alert(err.response?.data?.error || 'Payment error. Please try again.    } catch (err) { alert(err.re#C9A84C', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' },
    navBrand: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    navLogo: { color: '#C9A84C', fontWeight: '900', fontSize: '1.4rem', letterSpacing: '0.1em' },
    navSub: { color: '#666', fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase' },
                       d: 't    parent', color: '#C9A84C', border: '1px solid #C9A84C', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '0.05em' },
    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto    body: { maxWidth: '1000px', margin: '0 auto  background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' },
    cardTitle: { color: '#C9A84C', fontSize: '0.8rem', fontWeight: '700', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1rem' },
    badge: { padding: '1.25rem', borderRadius: '8px', border: `1px solid ${levelInfo.border}`, background: levelInfo.bg, textAlign: 'center' },
    badgeIcon: { fontSize: '2.5rem', color: levelInfo.color, marginBottom: '0.5rem' },
    badgeLabel: { color: levelInfo.color, fontWeight: '800', fontSize: '1rem', letterSpacing: '0.1em' },
    input: { width: '100%', padding: '0.65rem 0.9rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.95rem', marginBottom: '1rem' },
    label: { display: 'block', color: '#888', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.35rem', letterSpacing: '0.05em', textTransform: 'uppercase' },
    btnGold: { background: 'linear-gradient(135deg, #C9A84C, #9A7B2E)', color: '#111', padding: '0.75rem 2rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', letterSpacing: '0.05em' },
    planCard: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '1.5rem'    planCard: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '1.5rem'    planCard: { background: '#1a1a1a', navLogo}>B&E</div><div style={S.navSub}>Trusted Registry</div></div>
        </div>
        <button style={S.navBtn} onClick={logout}>LOGOUT</button>
      </nav>
      <div style={S.body}>
        {msg && <div style={{background:'rgba(201,168,76,0.15)',border:'1px solid #C9A84C',color:'#C9A84C',padding:'0.75rem 1rem',borderRadius:'6px',marginBottom:'1.5rem'}}>{msg}</div>}
                                                                                                                                                              view' ? 'Overview' : t === 'certify' ? 'Register Company' : 'Pricing & Upgrade'}</button>))}
        </div>
        {tab === 'overview' && (<div>{company ? (<div><div style={S.card}><div style={S.cardTitle}>Company Profile</div><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}><div><div style={{fontSize:'1.5rem',fontWeight:'800',color:'#fff',marginBottom:'0.25rem'}}>{company.companyName}</div><div style={{color:'#888',fontSize:'0.9rem'}}>{company.sector} — {company.country}</div>{company.website && <div style={{color:'#C9A84C',fontSize:'0.85rem',marginTop:'0.25rem'}}>{company.website}</div>}</div><div style={        {tab === 'overview' && (<div>{company ? (<div><div style={S.card}><div style={S.cardTitle}>Company Profile</div><div style={{display:'flex',justifyContent:'space-between',aligmpany.level}/3</div></div></div></div><div style={S.card}><div style={S.cardTitle}>Trust Badge Status</div><div style={S.badge}><div style={S.badgeIcon}>{levelInfo.icon}</div><div style={S.badgeLabel}>{levelInfo.label}</div><div style={{color:'#666',fontSize:'0.8rem',marginTop:'0.5rem'}}>B&E Trusted Registry — Verified Supplier</div></div><div style={{marginTop:'1rem',padding:'0.75rem',background:'#222',borderRadius:'6px',fontSize:'0.8rem',color:'#888'}}>Public verification URL:<span style={{color:'#C9A84C',marginLeft:'0.5rem',wordBreak:'break-all'}}>{window.location.origin}/verify/{company.id}</span></div></div><div style={S.card}><div style={S.cardTitle}>Certification Roadmap</div><div style={{display:'flex',gap:'0',position:'relative'}}>{[1,2,3].map(lvl => (<div key={lvl} style={{flex:1,textAlign:'center',padding:'1rem 0.5rem',position:'relative'}}><div style={{width:'36px',height:'36px',borderRadius:'50%',background:company.level>=lvl?'linear-gradient(135deg,#C9A84C,#9A7B2E)':'#2a2a2a',border:company.level>=lvl?'none':'1px solid #444',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 0.5rem',color:company.level>=lvl?'#111':'#555',fontWeight:'900'}}>{lvl}</div><div style={{fontSize:'0.75rem',color:company.level>=lvl?'#C9A84C':'#555',fontWeight:company.level>=lvl?'700':'400'}}>{lvl===1?'Documents':lvl===2?'KYC':'Site Visit'}</div></div>))}</div>{company.level < 3 && <button style={{...S.btnGold,width:'100%',marginTop:'1rem'}} onClick={()=>setTab('pricing')}>UPGRADE CERTIFICATION →</button>}</div></div>) : (<div style={{...S.card,textAlign:'center',padding:'3rem'}}><div style={{fontSize:'3rem',marginBottom:'1rem'}}>🏢</div><div style={{color:'#C9A84C',fontSize:'1.2rem',fontWeight:'700',marginBottom:'0.5rem'}}>No company registered yet</div><div style={{color:'#666',marginBottom:'1.5rem'}}>Register your company to start the certification process</div><button style={S.btnGold} onClick={()=>setTab('certify')}>REGISTER YOUR COMPANY</button></div>)}</div>)}
        {tab === 'certify' && (<div style={S.card}><div style={S.cardTitle}>Register Company for Certification</div><form onSubmit={handleApply}><label style={S.label}>Legal Company Name *</label><input style={S.input} type="text" value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} required /><label style={S.label}>Country of Registration *</label><input style={S.input} type="text" value={form.country} onChange={e=>setForm({...form,country:e.target.value})} required /><label style={S.label}>Industry / Sector *</label><input style={S.input} type="text" placeholder="e.g. Commodities, Energy, Agriculture" value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})} required /><label style={S.label}>Website</label><input style={S.input} type="text" placeholder="https://..." value={form.website} onChange={e=>setForm({...form,website:e.target.value})} /><button style={S.btnGold} type="submit">SUBMIT APPLICATION</button></form></div>)}
        {tab === 'pricing' && (<div><div style={{textAlign:'center',marginBottom:'2rem'}}><div style={{color:'#C9A84C',fontSize:'1.5rem',fontWeight:'800',letterSpacing:'0.05em'}}>CERTIFICATION PLANS</div><div style={{color:'#666',marginTop:'0.5rem'}}>Choose the certification level that matches your business needs</div></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',gap:'1rem'}}>{PLANS.map(plan => (<div key={plan.id} style={{...S.planCard,borderColor:company?.level===parseInt(plan.id[5])?'#C9A84C':'#333'}}><div style={{color:'#C9A84C',fontSize:'0.75rem',fontWeight:'700',marginBottom:'0.5rem',letterSpacing:'0.1em'}}>UPGRADE OPTION</div><div style={{fontSize:'1.3rem',fontWeight:'800',marginBottom:'0.25rem'}}>{plan.name}</div><div style={{color:'#888',fontSize:'0.85rem',marginBottom:'1rem'}}>{plan.subtitle}</div><div style={{fontSize:'2.2rem',fontWeight:'900',color:'#C9A84C',marginBottom:'0.25rem'}}>${plan.price}</div><div style={{color:'#555',fontSize:'0.75rem',marginBottom:'1rem'}}>One-time investment</div><ul style={{listStyle:'none',padding:0,marginBottom:'1.5rem',textAlign:'left'}}>{plan.features.map((f,i) => (<li key={i} style={{color:'#888',fontSize:'0.85rem',marginBottom:'0.5rem',paddingLeft:'1.5rem',position:'relative'}}><span style={{position:'absolute',left:0,color:'#C9A84C'}}>✓</span> {f}</li>))}</ul><button style={{...S.btnGold,width:'100%'}} onClick={() => handleCheckout(plan.id)} disabled={!company || company.level >= parseInt(plan.id[5]) || payLoading === plan.id}>{payLoading === plan.id ? 'Processing...' : company?.level >= parseInt(plan.id[5]) ? 'Already Certified' : 'Upgrade Now'}</button></div>))}</div></div>)}
      </div>
    </div>
  )
}