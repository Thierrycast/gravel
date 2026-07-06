import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Todas as APIs de leitura (o matcher só se aplica a GET). NetworkFirst:
      // o cache só é servido quando a rede falha ou estoura o timeout — dados
      // financeiros nunca vêm do cache com a rede saudável. O timeout alto
      // evita servir dado velho silenciosamente em conexões apenas lentas.
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) => url.hostname === "img.logo.dev",
      handler: new CacheFirst({
        cacheName: "external-logos",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Push notification handlers — typed via globalThis cast to avoid SW/lib.dom conflicts
const sw = globalThis as unknown as {
  addEventListener: (type: string, listener: (event: unknown) => void) => void
  registration: { showNotification: (title: string, opts?: object) => Promise<void> }
  clients: { openWindow: (url: string) => Promise<unknown> }
}

sw.addEventListener("push", (event) => {
  const e = event as { data?: { json?: () => { title?: string; body?: string; href?: string } }; waitUntil: (p: Promise<unknown>) => void }
  const data = e.data?.json?.() ?? {}
  e.waitUntil(
    sw.registration.showNotification(data.title ?? "Gravel Finance", {
      body: data.body ?? "",
      icon: "/icons/icon-192x192.png",
      data: { href: data.href ?? "/" },
    })
  )
})

sw.addEventListener("notificationclick", (event) => {
  const e = event as { notification: { close: () => void; data?: { href?: string } }; waitUntil: (p: Promise<unknown>) => void }
  e.notification.close()
  e.waitUntil(sw.clients.openWindow(e.notification.data?.href ?? "/"))
})
