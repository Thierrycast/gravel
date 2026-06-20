"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"

const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * ONE_HOUR

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stale-while-revalidate: serve cache, refetch silently.
        staleTime: 60_000,
        gcTime: ONE_DAY,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  })
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient)
  // Persister needs window.localStorage; null during SSR.
  const persister = useMemo(() => {
    if (typeof window === "undefined") return null
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: "gravel-query-cache",
      throttleTime: 1_000,
    })
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then(async (registrations) => {
          if (registrations.length > 0) {
            let clearedAny = false
            for (const registration of registrations) {
              try {
                const success = await registration.unregister()
                if (success) {
                  console.log("[pwa] Antigo SW desregistrado em desenvolvimento local:", registration.scope)
                  clearedAny = true
                }
              } catch (err) {
                console.warn("[pwa] Falha ao desregistrar SW em desenvolvimento local:", err)
              }
            }
            if (clearedAny && !sessionStorage.getItem("sw-cleared")) {
              sessionStorage.setItem("sw-cleared", "true")
              window.location.reload()
            }
          }
        })
      }
      return
    }
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[pwa] SW registration failed", err))
    }
    if (document.readyState === "complete") onLoad()
    else window.addEventListener("load", onLoad, { once: true })
    return () => window.removeEventListener("load", onLoad)
  }, [])

  if (!persister) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: ONE_DAY,
        // Bumping this string invalidates persisted cache after deploys.
        buster: "gravel-v1",
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
