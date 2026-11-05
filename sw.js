const CACHE_PREFIX = 'mgs-caddie-'
const CACHE = 'mgs-caddie-v29'
const BASE = new URL('./', self.registration.scope).toString()
const APP_SHELL = new URL('./', BASE).toString()
const VITE_MANIFEST = new URL('vite-manifest.json', BASE).toString()
const WEB_MANIFEST = new URL('manifest.webmanifest', BASE).toString()
const DOCUMENTS = new Set(['', 'index.html', 'strategy.html', 'course-selection.html', 'round-settings.html', 'management.html', 'cid-review.html', 'manifest.webmanifest', 'tsurumai-west-old.packet.html', 'vite-manifest.json'].map((path) => new URL(path, BASE).toString()))
const STATIC_EXTENSIONS = new Set(['.css', '.gif', '.ico', '.jpeg', '.jpg', '.js', '.json', '.mjs', '.png', '.svg', '.webmanifest', '.webp', '.woff', '.woff2'])
const baseUrl = new URL(BASE)
const sameOrigin = (url) => new URL(url).origin === baseUrl.origin

function canonicalCacheUrl(value) {
  const url = new URL(value, BASE)
  url.search = ''
  url.hash = ''
  return url.toString()
}

function isApiUrl(value) {
  const url = new URL(value, BASE)
  return url.origin === baseUrl.origin && url.pathname.startsWith(new URL('api/', BASE).pathname)
}

function isStaticAssetUrl(value) {
  const url = new URL(value, BASE)
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname) || isApiUrl(url)) return false
  const filename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
  const extensionIndex = filename.lastIndexOf('.')
  return extensionIndex >= 0 && STATIC_EXTENSIONS.has(filename.slice(extensionIndex).toLowerCase())
}

async function precacheApp() {
  const cache = await caches.open(CACHE)
  const assetUrls = new Set(DOCUMENTS)
  for (const url of DOCUMENTS) {
    const response = await fetch(url, { cache: 'reload' })
    if (!response.ok) throw new Error(`precache failed: ${url} (${response.status})`)
    await cache.put(url, response.clone())
    if (url === VITE_MANIFEST) {
      const manifest = await response.json()
      for (const entry of Object.values(manifest)) {
        if (entry.file) assetUrls.add(canonicalCacheUrl(new URL(entry.file, BASE)))
        for (const file of [...(entry.css || []), ...(entry.assets || [])]) assetUrls.add(canonicalCacheUrl(new URL(file, BASE)))
      }
      continue
    }
    if (url === WEB_MANIFEST) {
      const manifest = await response.json()
      for (const icon of manifest.icons || []) if (icon.src) assetUrls.add(canonicalCacheUrl(new URL(icon.src, BASE)))
      continue
    }
    if ((response.headers.get('content-type') || '').includes('text/html')) {
      const html = await response.text()
      for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
        const asset = canonicalCacheUrl(new URL(match[1], url))
        if (isStaticAssetUrl(asset)) assetUrls.add(asset)
      }
    }
  }
  await Promise.all([...assetUrls].filter((url) => !DOCUMENTS.has(url) && isStaticAssetUrl(url)).map(async (url) => {
    const response = await fetch(url, { cache: 'reload' })
    if (!response.ok) throw new Error(`asset precache failed: ${url} (${response.status})`)
    await cache.put(url, response)
  }))
}

self.addEventListener('install', (event) => { event.waitUntil(precacheApp()); self.skipWaiting() })
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !sameOrigin(event.request.url) || isApiUrl(event.request.url)) return
  const cacheKey = canonicalCacheUrl(event.request.url)
  if (event.request.mode !== 'navigate') {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(cacheKey)) || fetch(event.request)))
    return
  }
  const knownDocument = DOCUMENTS.has(cacheKey)
  event.respondWith(fetch(event.request).then(async (response) => {
    if (knownDocument && response.ok) await (await caches.open(CACHE)).put(cacheKey, response.clone())
    return response
  }).catch(async () => {
    const cache = await caches.open(CACHE)
    return (knownDocument ? await cache.match(cacheKey) : undefined) || (await cache.match(APP_SHELL)) || Response.error()
  }))
})
