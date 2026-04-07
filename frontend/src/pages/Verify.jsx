import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'

const BADGES = {
  0: { label: 'NOT CERTIFIED', color: '#555', bg: 'rgba(100,100,100,0.08)', border: '#333', icon: '○', desc: 'This company has not yet completed MyDD certification.' },
  1: { label: 'LEVEL 1 — DOCUMENT VERIFIED', color: '#C9A84C', bg: 'rgba(201,168,76,0.1)', border: '#C9A84C55', icon: '◆', desc: 'Legal documents reviewed and validated by MyDD analysts.' },
  2: { label: 'LEVEL 2 — KYC VALIDATED', color: '#E8C96D', bg: 'rgba(232,201,109,0.1)', border: '#E8C96D55', icon: '★', desc: 'Full KYC, UBO verification and AML compliance confirmed.' },
  3: { label: 'LEVEL 3 — SITE INSPECTED', color: '#2ecc71', bg: 'rgba(46,204,113,0.08)', border: '#2ecc7155', icon: '✔', desc: 'Physical site inspection completed by a certified PAC agent.' },
}

export default function Verify() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/verify/${id}`)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(() => { setError('Company not found or not registered in MyDD.'); setLoading(false) })
  }, [id])

  const badge = data ? BADGES[data.level] : null

  return (
    <div style={{minHeight:'100vh',background:'#0e0e0e',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem',fontFamily:'Inter,sans-serif'}}>
      <div style={{background:'#161616',border:'1px solid #2a2a2a',borderRadius:'16px',padding:'2.5rem',width:'100%',maxWidth:'480px',boxShadow:'0 0 60px rgba(201,168,76,0.1)',textAlign:'center'}}>

        <div style={{marginBottom:'2rem'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:'0.6rem',marginBottom:'0.5rem'}}>
            <div style={{background:'linear-gradient(135deg,#C9A84C,#9A7B2E)',borderRadius:'8px',width:'36px',height:'36px',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'900',color:'#111',fontSize:'1rem'}}>M</div>
            <div style={{fontSize:'1.5rem',fontWeight:'800',color:'#fff'}}>MyDD</div>
          </div>
          <div style={{color:'#555',fontSize:'0.72rem',letterSpacing:'0.15em',textTransform:'uppercase'}}>Official Supplier Verification</div>
        </div>

        {loading && (
          <div style={{color:'#555',padding:'2rem',fontSize:'0.9rem'}}>Verifying...</div>
        )}

        {error && (
          <div style={{background:'rgba(231,76,60,0.12)',border:'1px solid rgba(231,76,60,0.3)',color:'#ff6b6b',padding:'1rem',borderRadius:'8px',fontSize:'0.875rem'}}>
            {error}
          </div>
        )}

        {data && badge && (
          <div>
            <div style={{fontSize:'3rem',marginBottom:'0.75rem',color:badge.color}}>{badge.icon}</div>
            <div style={{fontSize:'1.6rem',fontWeight:'800',color:'#fff',marginBottom:'0.25rem'}}>{data.companyName}</div>
            <div style={{color:'#666',fontSize:'0.875rem',marginBottom:'2rem'}}>{data.sector} — {data.country}</div>

            <div style={{background:badge.bg,border:`1px solid ${badge.border}`,borderRadius:'12px',padding:'1.25rem',marginBottom:'1.5rem'}}>
              <div style={{color:badge.color,fontWeight:'800',fontSize:'0.9rem',letterSpacing:'0.08em',marginBottom:'0.5rem'}}>{badge.label}</div>
              <div style={{color:'#666',fontSize:'0.8rem'}}>{badge.desc}</div>
            </div>

            <div style={{background:'#1a1a1a',borderRadius:'10px',padding:'1rem',textAlign:'left',marginBottom:'1.5rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid #222'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>Status</span>
                <span style={{color:'#fff',fontSize:'0.8rem',fontWeight:'600'}}>{String(data.status).toUpperCase()}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid #222'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>Certification Level</span>
                <span style={{color:'#C9A84C',fontSize:'0.8rem',fontWeight:'700'}}>{data.level} / 3</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid #222'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>Badge</span>
                <span style={{color:'#fff',fontSize:'0.8rem'}}>{data.badge}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>Verified by</span>
                <span style={{color:'#C9A84C',fontSize:'0.8rem',fontWeight:'600'}}>B&E Consult FZCO</span>
              </div>
            </div>

            <div style={{display:'flex',gap:'0.5rem',justifyContent:'center',marginBottom:'1.5rem'}}>
              {[1,2,3].map(lvl => (
                <div key={lvl} style={{width:'32px',height:'32px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',fontWeight:'800',
                  background:data.level>=lvl?'linear-gradient(135deg,#C9A84C,#9A7B2E)':' #1f1f1f',
                  color:data.level>=lvl?'#111':'#444',
                  border:data.level>=lvl?'none':'1px solid #333'}}>
                  {lvl}
                </div>
              ))}
            </div>

            <div style={{color:'#333',fontSize:'0.72rem',borderTop:'1px solid #1f1f1f',paddingTop:'1rem'}}>
              MyDD — Powered by B&E Consult FZCO · Dubai Silicon Oasis, UAE
            </div>
          </div>
        )}
      </div>

      <div style={{marginTop:'1.5rem'}}>
        <Link to="/login" style={{color:'#444',fontSize:'0.78rem',textDecoration:'none'}}>
          Are you a company? <span style={{color:'#C9A84C'}}>Sign in to MyDD →</span>
        </Link>
      </div>
    </div>
  )
}