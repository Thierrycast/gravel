"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { SyncEvent, SyncEventType } from "@/lib/sync-events"

type StreamEvent = SyncEvent | { type: "ping"; at: string }

/** Eventos que significam "o dado no servidor mudou, recarregue". */
const DATA_CHANGED: SyncEventType[] = [
  "sync:done",
  "item:updated",
  "transactions:changed",
  // Mudança de estado de conexão também é dado novo (alimenta os avisos de
  // reconexão/consentimento).
  "item:needs_action",
  "connector:status",
]

// Estado no módulo: um único EventSource para o app inteiro, mesmo que vários
// componentes chamem o hook.
const streamState = {
  source: null as EventSource | null,
  subscribers: new Set<(event: StreamEvent) => void>(),
  connected: false,
}

function ensureStream() {
  if (streamState.source || typeof window === "undefined") return

  const source = new EventSource("/api/sync/events")
  streamState.source = source

  source.onopen = () => {
    streamState.connected = true
  }

  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as StreamEvent
      streamState.subscribers.forEach((subscriber) => subscriber(event))
    } catch {
      // Payload malformado: ignora em silêncio, o próximo evento resolve.
    }
  }

  source.onerror = () => {
    streamState.connected = false
    // O EventSource reconecta sozinho; só marcamos o estado para quem usa
    // polling como fallback.
  }
}

export function isSyncStreamConnected() {
  return streamState.connected
}

/**
 * Assina o stream de eventos de sincronização e mantém a UI fresca: invalida o
 * cache do React Query e revalida os Server Components quando o servidor avisa
 * que o dado mudou.
 *
 * Montar em um único lugar alto na árvore (o layout) — o EventSource é
 * compartilhado, mas cada montagem adiciona um assinante.
 */
export function useSyncStream(options?: { notify?: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null)
  const lastSeenAt = useRef<string | null>(null)

  useEffect(() => {
    ensureStream()

    const onEvent = (event: StreamEvent) => {
      if (event.type === "ping") return
      // Na reconexão o servidor reenvia os últimos eventos; ignora repetidos.
      if (lastSeenAt.current && event.at <= lastSeenAt.current) return
      lastSeenAt.current = event.at

      setLastEvent(event)

      if (DATA_CHANGED.includes(event.type)) {
        void queryClient.invalidateQueries()
        router.refresh()
      }

      if (!options?.notify) return

      if (event.type === "item:needs_action") {
        toast.warning(event.message ?? "Uma conexão precisa de atenção.", {
          id: `needs-action-${event.itemId ?? "unknown"}`,
          duration: 10_000,
        })
      } else if (event.type === "transactions:changed" && event.message) {
        toast.success(event.message, { duration: 4_000 })
      }
    }

    streamState.subscribers.add(onEvent)
    return () => {
      streamState.subscribers.delete(onEvent)
    }
  }, [options?.notify, queryClient, router])

  return { lastEvent, connected: streamState.connected }
}
