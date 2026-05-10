import { Component } from 'react'

/**
 * React ErrorBoundary — catches rendering / lifecycle errors anywhere below it
 * in the tree and shows a clean recovery UI instead of a white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, eventId: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Emit structured error to console — visible in Railway logs
    console.error(JSON.stringify({
      event: 'react_render_error',
      message: error?.message || String(error),
      component: info?.componentStack?.split('\n')[1]?.trim() || 'unknown',
    }))
  }

  handleReset() {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error?.message || 'An unexpected error occurred.'

    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
      }}>
        <div style={{
          background: '#161616',
          border: '1px solid #2a2a2a',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '480px',
          width: '100%',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '7px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '1rem' }}>M</div>
            <div style={{ color: '#C9A84C', fontWeight: '800', fontSize: '1.1rem' }}>MyDD</div>
          </div>

          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
          <div style={{ color: '#eee', fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            Something went wrong
          </div>
          <div style={{ color: '#555', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2rem', wordBreak: 'break-word' }}>
            {msg}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => this.handleReset()}
              style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.875rem' }}
            >
              Back to Home
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C44', padding: '0.6rem 1.4rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}
            >
              Retry
            </button>
          </div>
        </div>

        <div style={{ color: '#2a2a2a', fontSize: '0.7rem', marginTop: '2rem' }}>
          Error logged · B&amp;E Consult FZCO
        </div>
      </div>
    )
  }
}
