// Injects the pulse keyframe once into <head>, then exports a reusable box.
if (typeof document !== 'undefined' && !document.getElementById('__sk_css')) {
  const s = document.createElement('style')
  s.id = '__sk_css'
  s.textContent = '@keyframes skPulse{0%,100%{opacity:.35}50%{opacity:.65}}'
  document.head.appendChild(s)
}

/**
 * <Skeleton width height radius style />
 * Drop-in animated placeholder. Inherits parent width by default.
 */
export default function Skeleton({ width = '100%', height = '1rem', radius = '6px', style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg,#1e1e1e,#2a2a2a,#1e1e1e)',
        animation: 'skPulse 1.6s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
