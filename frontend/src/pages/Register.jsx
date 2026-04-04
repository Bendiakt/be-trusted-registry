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

  const S = {
    page: { minHeight:'100vh', background:'#111', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' },
    card: { background:'#1a1a1a', border:'1px solid #333', borderRadius:'12px', padding:'2.5rem', width:'100%', maxWidth:'440px', boxShadow:'0 0 40px rgba(201,168,76,0.1)' },
    title: { color:'#C9A84C', fontSize:'1.5re    title: { color:'#C9A84C', ftom:'0.25rem', letterSpacing:'0.05em' },
    sub: { col    sub: { col    sub: {5re    sub: { col    sub: { col    subabel: { display:'block', fontSize:'0.75rem', fontWeight:'600', color:'#888', marginBottom:'0.    sub: { col    sub: { col    sub: {ans    sub: { col    sub: { col    sub: {5re    s padding:'0.7rem 1rem', background:'#2a2a2a', border:'1px solid #444', bor    sub: { col    subr:'#fff', fontSize:'0.9   m', marginBottom:'1.1rem' },
    select: { width:'100%', padding:'0.7rem 1rem', bac    select: { widt border:'1px solid #444', borderRadius:'6px', color:'#fff', fontSize:    select: { width:'100%', paddi},
    btn: { width:'100%', background:'linear-gradient(135deg, #C9A84C, #9A7B2E)', color:'#111', padding:'0.8rem', borderRadius:'6px', border:'none', fontSize:'1rem', fontWeight:'700', cursor:'pointer', letterSpacing:'0.05em' },
    error: { background:'rgba(231,76,60,0.15)', border:'1px solid #e74c3c', color:'#ff6b6b', padding:'0.75rem', borderRadius:'6px', marginBottom:'1rem', fontSize:'0.875rem' }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{textAlign:'center', marginBottom:'1.5rem'}}>
          <div style={{fontSize:'2rem', color:'#C9A84C', fontWeight:'900', letterSpacing:'0.15em'}}>B&E</div>
        </div>
        <div style={S.title}>Create Account</div>
        <div style={S.sub}>Join the B&E Trusted Registry network</div>
        {error && <div style={S.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Company / Full Name</label>
          <input style={S.input} type="text" value={form.name}
            onChange={e => setForm({...form, name: e.target.value})} required />
          <label style={S.label}>Email Address</label>
          <input style={S.input} type="email" value={form.email}
            onChange={e => setForm({...form, email: e.target.value})} required />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" value={form.password}
            onChange={e => setForm({...            onChange={et.            onChange={e =              onChang.label}>I am registering as...</label>
                                                                                                                           <option va                                               </option>
            <option value="trader">Trader — Verifying Suppliers</option>
            <option value="pac">PAC Field A            <option value="pac">PAC F      </select>
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Creating account...'            {loading ? 'Creating account...'            {loading ? 'Creating acex            {loading ? 'Creating account...'    m', marginTop:'1.5rem'}}>
          Already registered? <Link to="/login          Alrea:'#C9A84C', fontWeight:'600'}}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
