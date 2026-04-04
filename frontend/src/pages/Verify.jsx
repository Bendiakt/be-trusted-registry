import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'

const BADGES = {
  0: { label: 'NOT CERTIFIED', color: '#666', bg: 'rgba(100,100,100,0.1)', border: '#444', icon: '○', desc: 'This company has not yet completed B&E certification.' },
  1: { label: 'LEVEL 1 — DOCUMENT VERIFIED', color: '#C9A84C', bg: 'rgba(201,168,76,0.1)', border: '#C9A84C', icon: '◆', desc: 'Legal documents reviewed and validated by B&E analysts.' },
  2: { label: 'LEVEL 2 — KYC VALIDATED', color: '#E8C96D', bg: 'rgba(232,201,109,0.1)', border: '#E8C96D', icon: '★', desc: 'Full KYC, UBO verification and AML compliance confirmed.' },
  3: { label: 'LEVEL 3 — SITE INSPECTED', color: '#2ecc71', bg: 'rgba(46,204,113,0.08)', border: '#2ecc71', icon: '✔', desc: 'Physical site inspection completed by a certified PAC agent.' },
}

export default function Verify() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`/api/verify/${id}`)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(() => { setError('Company not found or not registered in B&E Trusted Registry.'); setLoading(false) })
  }, [id])

  const badge = data ? BADGES[data.level || 0] : null

  return (
    <div style={{minHeight:'100vh',background:'#111',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem',fontFamily:'sans-serif'}}>
      <div style={{background:'#1a1a1a',border:'1px solid #333',borderRadius:'12px',padding:'2.5rem',width:'100%',maxWidth:'480px',boxShadow:'0 0 60px rgba(201,168,76,0.15)',textAlign:'center'}}>
        <div style={{color:'#C9A84C',fontSize:'2rem',fontWeight:'900',letterSpacing:'0.15em',marginBottom:'0.25rem'}}>B&E</div>
        <div style={{color:'#C9A84C',fontSize:'1rem',fontWeight:'700',letterSpacing:'0.2em',marginBottom:'0.25rem'}}>TRUSTED REGISTRY</div>
        <div style={{color:'#555',fontSize:'0.75rem',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:'2rem'}}>Official Supplier Verification</div>

        {loading && (
          <div style={{color:'#C9A84C',fontSize:'1rem'}}>Verifying...</div>
        )}

        {error && (
          <div style={{background:'rgba(231,76,60,0.15)',border:'1px solid #e74c3c',color:'#ff6b6b',padding:'1rem',borderRadius:'8px'}}>
            {error}
          </div>
        )}

        {data && badge && (
          <div>
            <div style={{fontSize:'3.5rem',marginBottom:'0.75rem',color:badge.color}}>{badge.icon}</div>
            <div style={{fontSize:'1.6rem',fontWeight:'800',color:'#fff',marginBottom:'0.25rem'}}>{data.companyName}</div>
            <div style={{color:'#666',marginBottom:'1.75rem',fontSize:'0.9rem'}}>{data.sector} — {data.country}</div>

            <div style={{background:badge.bg,border:`2px solid ${badge.color}`,borderRadius:'10px',padding:'1.25rem',marginBottom:'1.5rem'}}>
              <div style={{color:badge.color,fontWeight:'800',fontSize:'0.95rem',letterSpacing:'0.08em',marginBottom:'0.5rem'}}>{badge.label}</div>
              <div style={{color:'#888',fontSize:'0.8rem'}}>{badge.desc}</div>
            </div>

            <div style={{background:'#222',borderRadius:'8px',padding:'1rem',textAlign:'left',marginBottom:'1.5rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.4rem 0',borderBottom:'1px solid #333'}}>
                <span style={{color:'#666',fontSize:'0.8rem'}}>Status</span>
                <span style={{color:'#fff',fontSize:'0.8rem',fontWeight:'600'}}>{data.status?.toUpperCase()}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.4rem 0',borderBottom:'1px solid #333'}}>
                <span style={{color:'#666',fontSize:'0.8rem'}}>Certification Level</span>
                <span style={{color:'#C9A84C',fontSize:'0.8rem',fontWeight:'700'}}>{data.level || 0} / 3</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.4rem 0'}}>
                <span style={{color:'#666',fontSize:'0.8rem'}}>Verified by</span>
                <span style={{color:'#fff',fontSize:'0.8rem'}}>B&E Consult FZCO</span>
              </div>
            </div>

            <div style={{color:'#444',fontSize:'0.75rem',borderTop:'1px solid #2a2a2a',paddingTop:'1rem',marginBottom:'1.5rem'}}>
              B&E Consult FZCO is a TrustAsia verified partner. Certification details verified on {new Date().toLocaleDateString()}.
            </div>
          </div>
        )}

        <Link to="/" style={{display:'inline-block',marginTop:'1rem',padding:'0.75rem 1.5rem',background:'#C9A84C',color:'#111',textDecoration:'none',borderRadius:'6px',fontWeight:'700',fontSize:'0.9rem'}}>
          Back to Registry
        </Link>
      </div>
    </div>
  )
}
