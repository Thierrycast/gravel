// Gravel Finance Service Worker
// Strategy:
//   - Cache-first for static assets (/_next/static/*, fonts, images, icons)
//   - Stale-while-revalidate for HTML navigations
//   - Network-only for API/auth routes (never cache personal data)
//   - Offline fallback: /offline for navigations when network + cache both miss

const VERSION = "gravel-pwa-v1"
const STATIC_CACHE = `${VERSION}-static`
const RUNTIME_CACHE = `${VERSION}-runtime`
const OFFLINE_URL = "/offline"
const PRECACHE_URLS = ["/offline", "/icon.png", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true
  if (url.pathname.startsWith("/_next/image")) return true
  if (url.pathname === "/icon.png") return true
  if (url.pathname === "/manifest.webmanifest") return true
  return /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(
    url.pathname,
  )
}

function isApiRoute(url) {
  return url.pathname.startsWith("/api/")
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never intercept API requests — TanStack Query owns that cache layer.
  if (isApiRoute(url)) return

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request))
    return
  }
})

async function handleNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    if (offline) return offline
    return new Response("Offline", { status: 503, statusText: "Offline" })
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return cached || Response.error()
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting()
})
