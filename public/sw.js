// Keeps the home page's planet assets and the app's bundles on the visitor's device so a
// returning visit loads them from disk. Pages themselves are never intercepted, so a new
// deploy is picked up on the next load.

const CACHE = 'ku-exchange-v1'

// Third-party files the home page needs. The planet models are served with no-cache, so
// without this every visit re-requests about 2 MB before the planet can draw.
const ASSET_ORIGINS = [
  'https://unpkg.com/three@0.143.0/',
  'https://unpkg.com/lenis@1.3.23/',
  'https://api.getlayers.ai/storage/v1/object/public/public/assets/ascend-d9857ad1f2/',
  'https://www.gstatic.com/draco/versioned/decoders/1.5.5/',
]

// Vite names bundles name-<8 character hash>.ext, so a changed file gets a new name.
const HASHED_FILE = /-[A-Za-z0-9_-]{8}(\.[a-z]+)$/

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

// The page sends its preload list after the first visit so the next one is already fast.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache' || !Array.isArray(event.data.urls)) return
  const urls = event.data.urls.filter(isThirdPartyAsset)
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await Promise.all(urls.map(async (url) => {
      if (await cache.match(url, { ignoreVary: true })) return
      const response = await fetch(url, { mode: 'cors', credentials: 'same-origin' })
      if (response.ok) await cache.put(url, response)
    }))
  })().catch(() => {}))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (isThirdPartyAsset(request.url)) event.respondWith(staleWhileRevalidate(event))
  else if (isAppBundle(request.url)) event.respondWith(cacheFirst(request))
})

function isThirdPartyAsset(url) {
  return ASSET_ORIGINS.some((prefix) => url.startsWith(prefix))
}

function isAppBundle(url) {
  return url.startsWith(`${self.registration.scope}assets/`) && HASHED_FILE.test(new URL(url).pathname)
}

// Answers from the cache straight away and refreshes the copy in the background, so the
// planet still picks up a changed model on the following visit.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(event.request, { ignoreVary: true })
  const refresh = fetch(event.request).then((response) => {
    if (response.ok) cache.put(event.request, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(refresh.catch(() => {}))
    return cached
  }
  return refresh
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await removeOlderBuilds(cache, request.url)
    await cache.put(request, response.clone())
  }
  return response
}

// A new deploy renames each bundle; drop the previous build of the same file so the cache
// does not grow with every release.
async function removeOlderBuilds(cache, url) {
  const stem = new URL(url).pathname.replace(HASHED_FILE, '')
  const keys = await cache.keys()
  await Promise.all(keys
    .filter((key) => key.url !== url && isAppBundle(key.url) && new URL(key.url).pathname.replace(HASHED_FILE, '') === stem)
    .map((key) => cache.delete(key)))
}
