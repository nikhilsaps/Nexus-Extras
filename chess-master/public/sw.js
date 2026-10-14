// Service worker: cache the app shell + the Stockfish engine so the heavy .wasm
// downloads once over the ESP's weak WiFi and then runs offline forever.
//
// Strategy:
//  - Engine files + vendored Oat: cache-first (they are large and immutable-ish).
//  - Everything else (app shell, assets): stale-while-revalidate.
//  - Never cache /api/* (that's live data via the dumb host).

const CACHE_PREFIX = 'chess-master-'
const CACHE = CACHE_PREFIX + 'v2'

// Precache the engine specifically; it is the expensive asset.
const PRECACHE = [
  './engine/stockfish-19-lite-single.js',
  './engine/stockfish-19-lite-single.wasm',
  './vendor/oat.min.css',
  './vendor/oat.min.js',
  './data/openings.json',
  './data/openings-ref.json',
  './data/traps.json',
  './data/puzzles.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Live data: always go to the network, never cache.
  if (url.pathname.includes('/api/')) return

  const isEngineOrVendor =
    url.pathname.includes('/engine/') || url.pathname.includes('/vendor/')

  if (isEngineOrVendor) {
    // Cache-first for big immutable assets.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
            return res
          }),
      ),
    )
    return
  }

  // Stale-while-revalidate for the app shell.
  event.respondWith(
    caches.match(request).then((hit) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => hit)
      return hit || fetchPromise
    }),
  )
})
