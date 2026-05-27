import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'

const LEVEL_CONFIG = {
  1: { label: 'Level 1 — Document Verified', color: '#CD7F32', bg: 'rgba(205,127,50,0.07)', name: 'BRONZE' },
  2: { label: 'Level 2 — KYC Validated',     color: '#C0C0C0', bg: 'rgba(192,192,192,0.07)', name: 'SILVER' },
  3: { label: 'Level 3 — Site Inspected',    color: '#C9A84C', bg: 'rgba(201,168,76,0.10)', name: 'GOLD' },
}

export default function CertPrint() {
  const { id }  = useParams()
  const { t }   = useTranslation()
  const navigate = useNavigate()
  const [data, setData]         = useState(null)   // flat verify response
  const [error, setError]       = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    api.get(`/api/verify/${id}`)
      .then(res => {
        setData(res.data)
        document.title = `${res.data?.companyName || 'Certificate'} — MyDD Certificate`
      })
      .catch(() => setError('Certificate not found.'))
  }, [id])

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#555' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠</div>
          <div style={{ marginBottom: '1rem' }}>{error}</div>
          <Link to="/registry" style={{ color: '#C9A84C' }}>← Registry</Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontFamily: 'Inter,sans-serif', fontSize: '2rem' }}>
        ◌
      </div>
    )
  }

  // Flat structure from /api/verify/:id
  const lvl       = data.level || data.certificationLevel || 0
  const cfg       = LEVEL_CONFIG[lvl]
  const verifyUrl = `${window.location.origin}/verify/${id}`
  const now       = new Date()

  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .cert-page { box-shadow: none !important; border: 1px solid #ddd !important; }
        }
      `}</style>

      {/* Screen toolbar — hidden in print */}
      <div className="no-print" style={{ background: '#111', borderBottom: '1px solid #222', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', fontFamily: 'Inter,sans-serif' }}>
        <button onClick={() => navigate(`/verify/${id}`)} style={{ background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
          ← {t('verify.subtitle')}
        </button>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                const res = await api.get(`/api/verify/${id}/pdf`, { responseType: 'blob' })
                const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
                const a = document.createElement('a')
                a.href = url
                a.download = `certificate-${String(id).padStart(6, '0')}.pdf`
                a.click()
                URL.revokeObjectURL(url)
              } catch { /* silent */ }
              finally { setDownloading(false) }
            }}
            disabled={downloading}
            style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '7px', cursor: downloading ? 'wait' : 'pointer', fontWeight: '700', fontSize: '0.85rem', opacity: downloading ? 0.7 : 1 }}
          >
            {downloading ? '…' : t('cert_print.download_pdf')}
          </button>
          <button
            onClick={() => window.print()}
            style={{ background: 'transparent', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.35)', padding: '0.5rem 1rem', borderRadius: '7px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
          >
            {t('cert_print.print_pdf')}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(verifyUrl)}
            style={{ background: 'transparent', color: '#888', border: '1px solid #2a2a2a', padding: '0.5rem 1rem', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {t('cert_print.copy_link')}
          </button>
        </div>
      </div>

      {/* Certificate page */}
      <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', fontFamily: '"Georgia", serif' }}>
        <div className="cert-page" style={{ width: '100%', maxWidth: '720px', background: '#fff', borderRadius: '4px', boxShadow: '0 4px 40px rgba(0,0,0,0.14)', overflow: 'hidden' }}>

          {/* Colour bar */}
          <div style={{ background: cfg ? cfg.color : '#888', padding: '0.45rem', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.28em', textTransform: 'uppercase', opacity: 0.85 }}>
              B&amp;E CONSULT FZCO — DUBAI SILICON OASIS, UAE
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '3.5rem 4rem', textAlign: 'center' }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '1.2rem', fontFamily: 'Inter,sans-serif' }}>M</div>
              <div>
                <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: '800', fontSize: '1.3rem', color: '#111', letterSpacing: '-0.01em' }}>MyDD</div>
                <div style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.58rem', color: '#999', letterSpacing: '0.12em', textTransform: 'uppercase' }}>My Due Diligence</div>
              </div>
            </div>

            {/* Heading */}
            <div style={{ fontSize: '0.7rem', color: '#bbb', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: '0.7rem', fontFamily: 'Inter,sans-serif' }}>Certificate of Certification</div>
            <div style={{ fontSize: '0.6rem', color: '#ccc', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '2rem', fontFamily: 'Inter,sans-serif' }}>This is to certify that</div>

            {/* Company */}
            <div style={{ fontSize: 'clamp(1.5rem,4vw,2.25rem)', fontWeight: '700', color: '#111', marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
              {data.companyName || data.name || '—'}
            </div>
            {(data.country || data.sector) && (
              <div style={{ fontSize: '0.875rem', color: '#888', marginBottom: '2.5rem', fontFamily: 'Inter,sans-serif' }}>
                {[data.country, data.sector].filter(Boolean).join(' · ')}
              </div>
            )}

            {/* Divider */}
            <div style={{ width: '56px', height: '2px', background: cfg ? cfg.color : '#ccc', margin: '0 auto 2rem', borderRadius: '2px' }} />

            {/* Level badge */}
            {cfg ? (
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: cfg.bg, border: `1.5px solid ${cfg.color}55`, borderRadius: '12px', padding: '1.25rem 2.5rem', marginBottom: '2.5rem' }}>
                <div style={{ fontSize: '0.6rem', color: cfg.color, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: '700', fontFamily: 'Inter,sans-serif', marginBottom: '0.3rem' }}>{cfg.name} CERTIFIED</div>
                <div style={{ fontSize: '0.95rem', color: '#333', fontFamily: 'Inter,sans-serif' }}>{cfg.label}</div>
              </div>
            ) : (
              <div style={{ marginBottom: '2.5rem', color: '#bbb', fontFamily: 'Inter,sans-serif', fontSize: '0.9rem' }}>Not certified</div>
            )}

            {/* Dates */}
            {(data.verifiedAt || data.certInfo?.expiresAt) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
                {data.verifiedAt && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', marginBottom: '0.25rem' }}>Issued</div>
                    <div style={{ fontSize: '0.85rem', color: '#333', fontFamily: 'Inter,sans-serif' }}>{new Date(data.verifiedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                  </div>
                )}
                {data.certInfo?.expiresAt && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', marginBottom: '0.25rem' }}>Valid Until</div>
                    <div style={{ fontSize: '0.85rem', color: data.certInfo.expired ? '#ff6b6b' : '#333', fontFamily: 'Inter,sans-serif' }}>
                      {new Date(data.certInfo.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                      {data.certInfo.expired && ' (EXPIRED)'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Verification — QR code + URL side by side */}
            <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '0.9rem 1.5rem', marginBottom: '1.5rem', fontFamily: 'Inter,sans-serif', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              {/* QR code — generated by api.qrserver.com, loaded once at render */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(verifyUrl)}&color=111111&bgcolor=f9f9f9&margin=4`}
                alt="Verification QR code"
                width="72"
                height="72"
                style={{ flexShrink: 0, borderRadius: '4px' }}
              />
              <div>
                <div style={{ fontSize: '0.58rem', color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Verify online</div>
                <div style={{ fontSize: '0.72rem', color: '#666', wordBreak: 'break-all' }}>{verifyUrl}</div>
              </div>
            </div>

            {/* Cert ID */}
            <div style={{ fontSize: '0.62rem', color: '#ccc', fontFamily: 'Inter,sans-serif', letterSpacing: '0.1em' }}>
              CERT-{String(id).padStart(6, '0')} · Generated {now.toLocaleDateString('en-GB')}
            </div>
          </div>

          {/* Footer bar */}
          <div style={{ background: '#111', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#555', fontSize: '0.62rem', fontFamily: 'Inter,sans-serif', letterSpacing: '0.05em' }}>
              © {now.getFullYear()} B&amp;E Consult FZCO · Dubai Silicon Oasis, UAE
            </div>
            <div style={{ color: '#555', fontSize: '0.62rem', fontFamily: 'Inter,sans-serif' }}>mydd.work</div>
          </div>
        </div>
      </div>
    </>
  )
}
