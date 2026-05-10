import { useTranslation } from 'react-i18next'

/**
 * SmartPagination
 * Renders a compact page navigator with smart windowing:
 *   - Shows at most 9 consecutive pages around the current one
 *   - Adds "1 …" and "… N" shortcuts when the window doesn't include the endpoints
 *   - Shows total count
 *
 * Props:
 *   page     {number}   current page (1-based)
 *   pages    {number}   total number of pages
 *   total    {number}   total item count (displayed as label)
 *   onPage   {function} called with the target page number
 *   dark     {boolean}  true = dark theme (default), false = light
 */
export default function SmartPagination({ page, pages, total, onPage, dark = true }) {
  const { t } = useTranslation()
  if (!pages || pages <= 1) return null

  let start = Math.max(1, page - 4)
  let end   = Math.min(pages, start + 8)
  if (end - start < 8) start = Math.max(1, end - 8)
  const range = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const bg       = dark ? '#1f1f1f' : '#f4f4f4'
  const bgActive = 'linear-gradient(135deg,#C9A84C,#9A7B2E)'
  const colorActive   = '#111'
  const colorInactive = dark ? '#888' : '#555'
  const borderBtn     = dark ? 'none' : '1px solid #ddd'

  const btn = (key, label, target, active = false) => (
    <button
      key={key}
      onClick={() => onPage(target)}
      style={{
        padding: '0.4rem 0.75rem',
        borderRadius: '6px',
        border: borderBtn,
        cursor: 'pointer',
        fontSize: '0.8rem',
        background: active ? bgActive : bg,
        color: active ? colorActive : colorInactive,
        fontWeight: active ? '700' : '400',
        transition: 'opacity 0.15s',
      }}
    >{label}</button>
  )

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.3rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
      {start > 1 && btn('first', '1 …', 1)}
      {range.map(pg => btn(pg, pg, pg, pg === page))}
      {end < pages && btn('last', `… ${pages}`, pages)}
      {total != null && (
        <span style={{ color: dark ? '#333' : '#aaa', fontSize: '0.72rem', marginLeft: '0.4rem' }}>
          {t('pagination.total_count', { count: total.toLocaleString() })}
        </span>
      )}
    </div>
  )
}
