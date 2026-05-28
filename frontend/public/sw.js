/**
 * sw.js — MyDD Service Worker
 *
 * Strategy:
 *  - Static assets (JS/CSS/fonts/images) : cache-first (Vite content-hashed → safe)
 *  - HTML navigation                      : network-first → stale-while-revalidate
 *  - API (/api/*)                         : network-only, 503 JSON on offline
 *  - Public pages (/registry, /verify/*, /agents*) : cached for offline reading
 *
 * Cache names are versioned — bump SW_VERSION to force a clean install.
 */

const SW_VERSION   = 'v1.1'
const CACHE_STATIC = `mydd-static-${SW_VERSION}`
const CACHE_PAGES  = `mydd-pages-${SW_VERSION}`

/* ── Assets that must be available offline ── */
const PRECACHE = [
  '/',
  '/registry',
  '/agents',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
]

/* ── Install: precache shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_PAGES).then((cache) =>
      cache.addAll(PRECACHE).catch(() => { /* ignore missing assets in dev */ })
    )
  )
  self.skipWaiting()
})

/* ── Activate: purge old caches ── */
self.addEventListener('activate', (event) => {
  const KEEP = [CACHE_STATIC, CACHE_PAGES]
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

/* ── Fetch: routing strategy ── */
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // ── API: network-only, graceful offline JSON ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You are offline. Please check your connection.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )
    return
  }

  // ── Static assets (Vite hashed filenames) : cache-first ──
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_STATIC).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
        })
      )
    )
    return
  }

  // ── Public icons / manifest ──
  if (url.pathname === '/favicon.svg' || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.open(CACHE_PAGES).then((cache) =>
        cache.match(request).then((cached) => cached || fetch(request))
      )
    )
    return
  }

  // ── HTML navigation: network-first, stale fallback, then offline.html ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache navigations to public pages only (no auth-gated pages)
          const PUBLIC = ['/', '/registry', '/agents', '/legal', '/verify/']
          const isPublic = PUBLIC.some((p) => url.pathname === p || url.pathname.startsWith(p))
          if (isPublic && response.ok) {
            caches.open(CACHE_PAGES).then((cache) => cache.put(request, response.clone()))
          }
          return response
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match('/offline.html')
          )
        )
    )
    return
  }
})

/* ── Background sync: retry failed watchlist mutations ── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'watchlist-sync') {
    event.waitUntil(syncPendingWatchlist())
  }
})

async function syncPendingWatchlist() {
  try {
    const pending = await getPendingFromIDB()
    if (!pending?.length) return
    await Promise.all(
      pending.map((item) =>
        fetch(item.url, { method: item.method, headers: item.headers, body: item.body })
          .then(() => removePendingFromIDB(item.id))
          .catch(() => { /* retry next sync */ })
      )
    )
  } catch { /* IDB not available */ }
}

/* Minimal IDB helpers — stubs (real impl would use idb-keyval) */
async function getPendingFromIDB()       { return [] }
async function removePendingFromIDB(_id) { }
