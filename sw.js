const CACHE = 'mgs-caddie-v25'
const BASE = new URL('./', self.registration.scope).toString()
const APP_SHELL = new URL('./', BASE).toString()
const MANIFEST = new URL('manifest.webmanifest', BASE).toString()
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([APP_SHELL, MANIFEST])))
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).then((response) => {
    if (event.request.mode === 'navigate') {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(event.request, copy))
    }
    return response
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(APP_SHELL))))
})
