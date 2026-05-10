import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

const BADGE_META = {
  0: { color: '#555', bg: 'rgba(100,100,100,0.08)', border: '#333', icon: '○' },
  1: { color: '#C9A84C', bg: 'rgba(201,168,76,0.1)',  border: '#C9A84C55', icon: '◆' },
  2: { color: '#E8C96D', bg: 'rgba(232,201,109,0.1)', border: '#E8C96D55', icon: '★' },
  3: { color: '#2ecc71', bg: 'rgba(46,204,113,0.08)', border: '#2ecc7155', icon: '✔' },
}

export default function Verify() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/verify/${id}`)
      .then(res => {
        const d = res.data
        setData(d)
        setLoading(false)
        const title = `${d.companyName || 'Company'} — B&E Certified Supplier · MyDD`
        document.title = title
        const BASE = window.location.origin
        const url  = `${BASE}/verify/${id}`
        const LEVEL_NAMES = { 1: 'Level 1 — Document Verified', 2: 'Level 2 — KYC Validated', 3: 'Level 3 — Site Inspected' }
        const desc = d.level > 0
          ? `${d.companyName} is certified at ${LEVEL_NAMES[d.level] || `Level ${d.level}`} on the B&E Trusted Registry. Verify instantly at MyDD.`
          : `${d.companyName} is listed on the B&E Trusted Registry. Verification powered by MyDD.`
        ;[
          ['meta[name="description"]',         { name: 'description',         content: desc }],
          ['meta[property="og:title"]',         { property: 'og:title',        content: title }],
          ['meta[property="og:description"]',   { property: 'og:description',  content: desc }],
          ['meta[property="og:url"]',           { property: 'og:url',          content: url }],
          ['meta[property="og:type"]',          { property: 'og:type',         content: 'profile' }],
          ['meta[name="twitter:card"]',         { name: 'twitter:card',        content: 'summary' }],
          ['meta[name="twitter:title"]',        { name: 'twitter:title',       content: title }],
          ['meta[name="twitter:description"]',  { name: 'twitter:description', content: desc }],
        ].forEach(([sel, attrs]) => {
          let el = document.querySelector(sel)
          if (!el) { el = document.createElement('meta'); document.head.appendChild(el) }
          Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
        })
      })
      .catch(() => { setError(t('verify.not_found')); setLoading(false) })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Schema.org JSON-LD — injected after data loads for rich search results
  useEffect(() => {
    if (!data) return
    const BASE = window.location.origin
    const url  = `${BASE}/verify/${id}`
    const LEVEL_NAMES = { 1: 'Level 1 — Document Verified', 2: 'Level 2 — KYC Validated', 3: 'Level 3 — Site Inspected' }
    const ldJson = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: data.companyName,
      url: data.website || url,
      description: `${data.companyName} is listed on the B&E Trusted Registry, certified by MyDD.`,
      sameAs: [url],
      ...(data.country && { areaServed: data.country }),
      ...(data.level > 0 && {
        hasCredential: {
          '@type': 'EducationalOccupationalCredential',
          name: `B&E MyDD ${LEVEL_NAMES[data.level] || `Level ${data.level}`} Certification`,
          credentialCategory: 'certification',
          recognizedBy: { '@type': 'Organization', name: 'B&E Consult FZCO', url: 'https://mydd.work' },
        },
      }),
    }
    const scriptId = `ld-json-verify-${id}`
    let script = document.getElementById(scriptId)
    if (!script) { script = document.createElement('script'); script.id = scriptId; document.head.appendChild(script) }
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(ldJson)
    return () => { document.getElementById(scriptId)?.remove() }
  }, [data, id])

  const meta = data ? BADGE_META[data.level] : null
  const badgeLabel = data ? t(`verify.badges.${data.level}_label`) : ''
  const badgeDesc  = data ? t(`verify.badges.${data.level}_desc`) : ''
  const [snippetCopied, setSnippetCopied] = useState(false)

  // Derive API base from current window location so it works on any env
  const apiBase = typeof window !== 'undefined'
    ? window.location.origin.replace(':5173', ':3000')  // dev: vite→node
    : ''

  const badgeSvgUrl  = `${apiBase}/api/badge/${id}.svg`
  const verifyPageUrl = typeof window !== 'undefined' ? `${window.location.origin}/verify/${id}` : ''
  const embedSnippet = `<a href="${verifyPageUrl}" target="_blank" rel="noreferrer">\n  <img src="${badgeSvgUrl}" alt="MyDD Certified" height="72">\n</a>`

  const copySnippet = useCallback(() => {
    navigator.clipboard.writeText(embedSnippet).then(() => {
      setSnippetCopied(true)
      setTimeout(() => setSnippetCopied(false), 2000)
    })
  }, [embedSnippet])

  return (
    <div style={{minHeight:'100vh',background:'#0e0e0e',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem',fontFamily:'Inter,sans-serif'}}>
      <div style={{background:'#161616',border:'1px solid #2a2a2a',borderRadius:'16px',padding:'2.5rem',width:'100%',maxWidth:'480px',boxShadow:'0 0 60px rgba(201,168,76,0.1)',textAlign:'center'}}>

        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'1rem'}}>
          <LanguageSwitcher />
        </div>

        <div style={{marginBottom:'2rem'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:'0.6rem',marginBottom:'0.5rem'}}>
            <div style={{background:'linear-gradient(135deg,#C9A84C,#9A7B2E)',borderRadius:'8px',width:'36px',height:'36px',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'900',color:'#111',fontSize:'1rem'}}>M</div>
            <div style={{fontSize:'1.5rem',fontWeight:'800',color:'#fff'}}>{t('brand.name')}</div>
          </div>
          <div style={{color:'#555',fontSize:'0.72rem',letterSpacing:'0.15em',textTransform:'uppercase'}}>{t('verify.subtitle')}</div>
        </div>

        {loading && (
          <div style={{color:'#555',padding:'2rem',fontSize:'0.9rem'}}>{t('verify.verifying')}</div>
        )}

        {error && (
          <div style={{background:'rgba(231,76,60,0.12)',border:'1px solid rgba(231,76,60,0.3)',color:'#ff6b6b',padding:'1rem',borderRadius:'8px',fontSize:'0.875rem'}}>
            {error}
          </div>
        )}

        {data && meta && (
          <div>
            <div style={{fontSize:'3rem',marginBottom:'0.75rem',color:meta.color}}>{meta.icon}</div>
            <div style={{fontSize:'1.6rem',fontWeight:'800',color:'#fff',marginBottom:'0.25rem'}}>{data.companyName}</div>
            <div style={{color:'#666',fontSize:'0.875rem',marginBottom:'2rem'}}>{data.sector} — {data.country}</div>

            <div style={{background:meta.bg,border:`1px solid ${meta.border}`,borderRadius:'12px',padding:'1.25rem',marginBottom:'1.5rem'}}>
              <div style={{color:meta.color,fontWeight:'800',fontSize:'0.9rem',letterSpacing:'0.08em',marginBottom:'0.5rem'}}>{badgeLabel}</div>
              <div style={{color:'#666',fontSize:'0.8rem'}}>{badgeDesc}</div>
            </div>

            <div style={{background:'#1a1a1a',borderRadius:'10px',padding:'1rem',textAlign:'left',marginBottom:'1.5rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid #222'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>{t('verify.status')}</span>
                <span style={{color:'#fff',fontSize:'0.8rem',fontWeight:'600'}}>{String(data.status).toUpperCase()}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid #222'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>{t('verify.cert_level')}</span>
                <span style={{color:'#C9A84C',fontSize:'0.8rem',fontWeight:'700'}}>{data.level} / 3</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid #222'}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>{t('verify.badge')}</span>
                <span style={{color:'#fff',fontSize:'0.8rem'}}>{data.badge}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0', ...(data.website ? {borderBottom:'1px solid #222'} : {})}}>
                <span style={{color:'#555',fontSize:'0.8rem'}}>{t('verify.verified_by')}</span>
                <span style={{color:'#C9A84C',fontSize:'0.8rem',fontWeight:'600'}}>B&amp;E Consult FZCO</span>
              </div>
              {data.website && (
                <div style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0'}}>
                  <span style={{color:'#555',fontSize:'0.8rem'}}>{t('verify.website')}</span>
                  <a href={data.website} target="_blank" rel="noreferrer" style={{color:'#4a90e2',fontSize:'0.8rem',fontWeight:'500',textDecoration:'none',wordBreak:'break-all'}}>{data.website.replace(/^https?:\/\//, '')}</a>
                </div>
              )}
            </div>

            <div style={{display:'flex',gap:'0.5rem',justifyContent:'center',marginBottom:'1.5rem'}}>
              {[1,2,3].map(lvl => (
                <div key={lvl} style={{width:'32px',height:'32px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',fontWeight:'800',
                  background:data.level>=lvl?'linear-gradient(135deg,#C9A84C,#9A7B2E)':'#1f1f1f',
                  color:data.level>=lvl?'#111':'#444',
                  border:data.level>=lvl?'none':'1px solid #333'}}>
                  {lvl}
                </div>
              ))}
            </div>

            {/* Actions: print cert + share + registry */}
            {data.level > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/verify/${id}/print`)}
                  style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', border: 'none', padding: '0.5rem 1.1rem', borderRadius: '7px', cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem' }}
                >
                  {t('verify.download_cert')}
                </button>
                {/* LinkedIn share */}
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyPageUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#0A66C2', color: '#fff', textDecoration: 'none', padding: '0.45rem 1rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: '600' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  {t('verify.share_linkedin')}
                </a>
                {/* Native share (mobile) */}
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button
                    onClick={() => navigator.share({ title: `${data.companyName} — B&E Certified`, url: verifyPageUrl }).catch(() => {})}
                    style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '0.45rem 0.8rem', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    ↗
                  </button>
                )}
                <Link to="/registry" style={{ background: 'transparent', color: '#555', textDecoration: 'none', border: '1px solid #2a2a2a', padding: '0.45rem 1rem', borderRadius: '7px', fontSize: '0.8rem' }}>
                  {t('landing.nav_registry')}
                </Link>
              </div>
            )}

            {/* Badge embed section — only for certified companies */}
            {data.level > 0 && (
              <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                <div style={{ color: '#555', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  {t('verify.embed_badge')}
                </div>
                {/* Badge preview */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  <img src={badgeSvgUrl} alt="MyDD badge preview" height="56" style={{ borderRadius: '6px' }} />
                </div>
                {/* Code snippet */}
                <div style={{ position: 'relative' }}>
                  <pre style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: '6px', padding: '0.65rem 0.9rem', fontSize: '0.65rem', color: '#666', overflowX: 'auto', margin: 0, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {embedSnippet}
                  </pre>
                  <button
                    onClick={copySnippet}
                    style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: snippetCopied ? '#0e2318' : '#1a1a1a', color: snippetCopied ? '#2ecc71' : '#555', border: `1px solid ${snippetCopied ? 'rgba(46,204,113,0.3)' : '#2a2a2a'}`, borderRadius: '4px', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.65rem', fontWeight: '600' }}
                  >
                    {snippetCopied ? '✓' : t('cert_print.copy_link')}
                  </button>
                </div>
              </div>
            )}

            <div style={{color:'#333',fontSize:'0.72rem',borderTop:'1px solid #1f1f1f',paddingTop:'1rem'}}>
              {t('brand.powered')}
            </div>
          </div>
        )}
      </div>

      <div style={{marginTop:'1.5rem'}}>
        <Link to="/login" style={{color:'#444',fontSize:'0.78rem',textDecoration:'none'}}>
          {t('verify.sign_in_prompt')} <span style={{color:'#C9A84C'}}>{t('verify.sign_in_link')}</span>
        </Link>
      </div>
    </div>
  )
}
