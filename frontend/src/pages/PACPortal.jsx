import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function PACPortal() {
  const [missions, setMissions] = useState([])
  const [profile, setProfile] = useState({ name: '', location: '', languages: '', certifications: '' })
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()
  const token = localStorage.getItem('token')

  useEffect(() => {
    axios.get('/api/pac/missions', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setMissions(res.data))
      .catch(() => {})
  }, [])

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/pac/profile', profile, { headers: { Authorization: `Bearer ${token}` } })
      setMsg('Profile saved successfully!')
    } catch { setMsg('Error saving profile') }
  }

  const acceptMission = async (id) => {
    try {
      await axios.post(`/api/pac/missions/${id}/accept`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setMsg('Mission accepted!')
    } catch { setMsg('Error accepting mission') }
  }

  const logout = () => { localStorage.clear(); navigate('/login') }

  return (
    <div style={{minHeight:'100vh',background:'#f0f4f8',fontFamily:'sans-serif'}}>
      <nav style={{background:'#1e3a5f',padding:'1rem 2rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 style={{color:'white',margin:0,fontSize:'1.2rem',fontWeight:'bold'}}>B&E — PAC Agent Portal</h1>
        <button onClick={logout} style={{background:'transparent',color:'#93c5fd',border:'1px solid #93c5fd',padding:'0.4rem 1rem',borderRadius:'6px',cursor:'pointer'}}>Logout</button>
      </nav>

      <div style={{maxWidth:'800px',margin:'2rem auto',padding:'0 1rem'}}>
        {msg && <div style={{background:'#ecfdf5',border:'1px solid #059669',color:'#065f46',padding:'0.75rem 1rem',borderRadius:'8px',marginBottom:'1rem'}}>{msg}</div>}

        <div style={{background:'white',borderRadius:'12px',padding:'2rem',boxShadow:'0 2px 10px rgba(0,0,0,0.08)',marginBottom:'1.5rem'}}>
          <h2 style={{color:'#1e3a5f',marginTop:0}}>Your PAC Profile</h2>
          <form onSubmit={handleProfileUpdate}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',fontWeight:'600',marginBottom:'0.4rem',color:'#374151'}}>Full Name</label>
                <input type="text" style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'0.6rem 0.75rem',boxSizing:'border-box'}}
                  value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',fontWeight:'600',marginBottom:'0.4rem',color:'#374151'}}>Location / Country</label>
                <input type="text" style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'0.6rem 0.75rem',boxSizing:'border-box'}}
                  value={profile.location} onChange={e => setProfile({...profile, location: e.target.value})} />
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',fontWeight:'600',marginBottom:'0.4rem',color:'#374151'}}>Languages</label>
                <input type="text" placeholder="e.g. English, French, Arabic" style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'0.6rem 0.75rem',boxSizing:'border-box'}}
                  value={profile.languages} onChange={e => setProfile({...profile, languages: e.target.value})} />
              </div>
              <div>
                <label style={{display:'block',fontSize:'0.875rem',fontWeight:'600',marginBottom:'0.4rem',color:'#374151'}}>Certifications</label>
                <input type="text" placeholder="e.g. ISO 9001, AML" style={{width:'100%',border:'1px solid #d1d5db',borderRadius:'8px',padding:'0.6rem 0.75rem',boxSizing:'border-box'}}
                  value={profile.certifications} onChange={e => setProfile({...profile, certifications: e.target.value})} />
              </div>
            </div>
            <button type="submit" style={{background:'#1e3a5f',color:'white',padding:'0.6rem 1.5rem',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'600'}}>
              Save Profile
            </button>
          </form>
        </div>

        <div style={{background:'white',borderRadius:'12px',padding:'2rem',boxShadow:'0 2px 10px rgba(0,0,0,0.08)'}}>
          <h2 style={{color:'#1e3a5f',marginTop:0}}>Available Missions</h2>
          {missions.length === 0 ? (
            <div style={{textAlign:'center',padding:'2rem',color:'#9ca3af'}}>
              <p style={{fontSize:'1.1rem'}}>No missions available yet.</p>
              <p style={{fontSize:'0.875rem'}}>New site inspection requests will appear here.</p>
            </div>
          ) : (
            missions.map(m => (
              <div key={m.id} style={{border:'1px solid #e5e7eb',borderRadius:'8px',padding:'1rem',marginBottom:'1rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <p style={{fontWeight:'bold',margin:'0 0 0.25rem',color:'#111'}}>{m.company_name}</p>
                  <p style={{color:'#6b7280',fontSize:'0.875rem',margin:'0 0 0.25rem'}}>{m.location} — {m.type}</p>
                  <p style={{color:'#9ca3af',fontSize:'0.8rem',margin:0}}>{m.description}</p>
                </div>
                <button onClick={() => acceptMission(m.id)}
                  style={{background:'#059669',color:'white',padding:'0.5rem 1rem',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'600',whiteSpace:'nowrap'}}>
                  Accept
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
