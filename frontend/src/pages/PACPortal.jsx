import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function PACPortal() {
  const [missions, setMissions] = useState([])
  const [profile, setProfile] = useState({ name: '', location: '', languages: '', certifications: '', bio: '' })
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [tab, setTab] = useState('missions')
  const navigate = useNavigate()
  const token = localStorage.getItem('token')

  useEffect(() => {
    axios.get('/api/pac/missions', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setMissions(res.data)).catch(() => {})
  }, [])

  const saveProfile = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/pac/profile', profile, { headers: { Authorization: `Bearer ${token}` } })
      setMsg({ text: 'Profile saved successfully', type: 'success' })
    } catch { setMsg({ text: 'Error saving profile', type: 'error' }) }
  }

  const acceptMission = async (id) => {
    try {
      await axios.post(`/api/pac/missions/${id}/accept`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setMsg({ text: 'Mission accepted!', type: 'success' })
      setMissions(prev => prev.map(m => m.id === id ? { ...m, status: 'assigned' } : m))
    } catch { setMsg({ text: 'Error accepting mission', type: 'error' }) }
  }

  const logout = () => { localStorage.clear(); navigate('/login') }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', fontFamily: 'Inter,sans-serif' }}>
      <nav style={{ background: '#161616', borderBottom: '1px solid #C9A84C33', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '6px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '0.9rem' }}>M</div>
          <div>
            <div style={{ color: '#fff', fontWeight: '800', fontSize: '1rem', letterSpacing: '-0.01em' }}>MyDD</div>
            <div style={{ color: '#555', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PAC Agent Portal</div>
          </div>
        </div>
        <button onClick={logout} style={{ background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C44', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '0.05em' }}>LOGOUT</button>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
        {msg.text && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              background: msg.type === 'success' ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
              border: msg.type === 'success' ? '1px solid rgba(46,204,113,0.4)' : '1px solid rgba(231,76,60,0.4)',
              color: msg.type === 'success' ? '#2ecc71' : '#ff6b6b'
            }}
          >
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '2rem', borderBottom: '1px solid #222' }}>
          {['missions', 'profile'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: tab === t ? '#C9A84C' : '#555',
                borderBottom: tab === t ? '2px solid #C9A84C' : '2px solid transparent',
                fontWeight: tab === t ? '700' : '400',
                fontSize: '0.85rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase'
              }}
            >
              {t === 'missions' ? 'Available Missions' : 'My Profile'}
            </button>
          ))}
        </div>

        {tab === 'missions' && (
          <div>
            <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Your Status</div>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div><div style={{ color: '#555', fontSize: '0.75rem' }}>Active Missions</div><div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: '800' }}>{missions.filter(m => m.status === 'assigned').length}</div></div>
                <div><div style={{ color: '#555', fontSize: '0.75rem' }}>Available</div><div style={{ color: '#C9A84C', fontSize: '1.5rem', fontWeight: '800' }}>{missions.filter(m => m.status === 'available').length}</div></div>
                <div><div style={{ color: '#555', fontSize: '0.75rem' }}>Completed</div><div style={{ color: '#2ecc71', fontSize: '1.5rem', fontWeight: '800' }}>{missions.filter(m => m.status === 'completed').length}</div></div>
              </div>
            </div>

            {missions.length === 0 ? (
              <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
                <div style={{ color: '#C9A84C', fontSize: '1rem', fontWeight: '700', marginBottom: '0.5rem' }}>No missions available yet</div>
                <div style={{ color: '#555', fontSize: '0.875rem' }}>New site inspection requests will appear here when companies apply for Level 3 certification.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {missions.map(m => (
                  <div key={m.id} style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: '700', fontSize: '1rem', marginBottom: '0.25rem' }}>{m.company_name}</div>
                      <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{m.location} - {m.type}</div>
                      <div style={{ color: '#555', fontSize: '0.8rem' }}>{m.description}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#C9A84C', fontWeight: '800', fontSize: '1rem' }}>${m.fee || '500'}</div>
                        <div style={{ color: '#555', fontSize: '0.7rem' }}>fee</div>
                      </div>
                      {m.status === 'available' ? (
                        <button onClick={() => acceptMission(m.id)} style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          Accept
                        </button>
                      ) : (
                        <div style={{ background: 'rgba(46,204,113,0.12)', color: '#2ecc71', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', border: '1px solid rgba(46,204,113,0.3)' }}>Assigned</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '2rem' }}>
            <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.5rem' }}>PAC Agent Profile</div>
            <form onSubmit={saveProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Full Name</label>
                  <input type="text" style={{ width: '100%', padding: '0.7rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Country / City</label>
                  <input type="text" placeholder="e.g. Dubai, UAE" style={{ width: '100%', padding: '0.7rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} value={profile.location} onChange={e => setProfile({ ...profile, location: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Languages</label>
                  <input type="text" placeholder="e.g. English, French, Arabic" style={{ width: '100%', padding: '0.7rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} value={profile.languages} onChange={e => setProfile({ ...profile, languages: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Certifications</label>
                  <input type="text" placeholder="e.g. ISO 9001, AML, CAMS" style={{ width: '100%', padding: '0.7rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} value={profile.certifications} onChange={e => setProfile({ ...profile, certifications: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bio / Expertise</label>
                <textarea rows={3} placeholder="Describe your expertise, sectors covered, past missions..." style={{ width: '100%', padding: '0.7rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} />
              </div>
              <button type="submit" style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', letterSpacing: '0.04em' }}>
                SAVE PROFILE
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}