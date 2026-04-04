import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/login', form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('role', res.data.user.role)
      navigate(res.data.user.role === 'pac' ? '/pac' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{minHeight:'100vh',background:'#111',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{background:'      <div style={{background:'      <div style={{background:'     m',width:'100%',maxWidth:'420px',boxShadow:'0 0 40px rgba(201,168,76,0.1)'}}>
        <d        <d        <d   enter',marginBottom:'2rem'}}>
          <div style={{fontSize:'2.5rem',color:'#C9A84C',fontWeight:'900',letterSpacing:'0.15em'}}>B&E</div>
          <div style={{fontSize:'1.8rem',fontWeight:'800',color:'#C9A84C',letterSpacing:'0.1em'}}>TRUSTED REGISTRY</div>
                       color:'#888',fontSize:'0.8rem',mar                       color:'#888',fontSize:'0.8rem',mar er                       color:'#888',fontSize:'0.8rv>
        </div>
        {error && <div style={{backgrou        {error && <div style={{backgrou        {error && <div style',        {er75rem',bo        {error && <div style={{backgrou        {error && <>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#888',marginBottom:'0.4rem',letterSpacing:'0.05em',textTransform:'uppercase'}}>Email Address</label>
          <input style={{width:'100%',padding:'0.7rem 1rem',background:'#2a2a2a',border:'1px solid #444',borderRadius:'6px',color:'#fff',fontSize:'1rem',marginBottom:'1.25rem'}} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#888',marginBottom:'0.4rem',letterSpacing:'0.05em',textTransform:'uppercase'}}>Password</label>
          <input style={{width:'100%',padding:'0.7rem 1rem',background:'#2a2a2a',border:'1px solid #444',borderRadius:'6px',color:'#fff',fontSize:'1rem',marginBottom:'1.25rem'}} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          <button style={{width:'100%',background:'li          <button style={{width:'100%E)',color:'#111',padding:'0.8rem',borderRadius:'6px',border:'none',fontSize:'1rem',fontWeight:'700',cursor:'pointer',letterSpacing:'0.05em'}} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'SIGN IN'}
          </button>
        </form>
        <div style={{textAlign:'center',color:'#888',fontSize:'0.875rem',marginTop:'1.5rem'}}>
          No account? <Link to="/register" style={{color:'#C9A84C',fontWeight:'600'}}>Register here</Link>
        </div>
        <div style={{textAlign:'center',marginTop:'1rem',color:'#555',fontSize:'0.75rem'}}>
          B&E Consult FZCO — Dubai Silicon Oasis, UAE
        </div>
      </div>
    </div>
  )
}
