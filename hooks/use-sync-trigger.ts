"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useSyncStream } from "@/hooks/use-sync-stream"

// O caminho normal de conclusão é o evento `sync:done` do SSE. O polling ficou
// como rede de segurança para quando o stream não está disponível (proxy
// bufferizando, aba restaurada sem conexão), então pode ser mais espaçado.
const POLL_INTERVAL_MS = 8_000
const MAX_POLLS = 45
export const SYNC_TOAST_ID = "gravel-sync"

export type SyncTriggerStatus = "idle" | "syncing" | "done" | "error"

type TriggerOpts = {
  full?: boolean
}

type TriggerResponseShape = {
  results?: { syncStatus?: string | null }
}

// Module-level singleton — guarantees only ONE polling loop is active even if
// multiple components mount the hook (sync button + pull-to-refresh + banner).
const pollState = {
  active: false,
  timer: null as ReturnType<typeof setTimeout> | null,
  subscribers: new Set<(status: SyncTriggerStatus) => void>(),
  /** Definido enquanto um sync está em voo, para o SSE poder encerrá-lo. */
  finish: null as ((next: "done" | "error", message: string) => void) | null,
}

function broadcast(status: SyncTriggerStatus) {
  pollState.subscribers.forEach((cb) => cb(status))
}

export function useSyncTrigger() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SyncTriggerStatus>(
    pollState.active ? "syncing" : "idle",
  )
  const mountedRef = useRef(true)
  const { lastEvent } = useSyncStream()

  useEffect(() => {
    const onChange = (next: SyncTriggerStatus) => {
      if (mountedRef.current) setStatus(next)
    }
    pollState.subscribers.add(onChange)
    return () => {
      mountedRef.current = false
      pollState.subscribers.delete(onChange)
    }
  }, [])

  // Conclusão pelo stream: o servidor avisa no instante em que termina, em vez
  // de esperarmos o próximo poll.
  useEffect(() => {
    if (!lastEvent || !pollState.active || !pollState.finish) return
    if (lastEvent.type === "sync:done") {
      pollState.finish("done", "Sincronização concluída.")
    } else if (lastEvent.type === "sync:error") {
      pollState.finish("error", lastEvent.message ?? "A sincronização falhou.")
    }
  }, [lastEvent])

  const trigger = useCallback(
    async ({ full = false }: TriggerOpts = {}) => {
      if (pollState.active) return

      pollState.active = true
      broadcast("syncing")
      toast.loading("Sincronizando…", {
        id: SYNC_TOAST_ID,
        description: "Buscando seus cascalhos com a API.",
        duration: Infinity,
      })

      const finish = (next: "done" | "error", message: string) => {
        if (!pollState.active) return
        if (pollState.timer) {
          clearTimeout(pollState.timer)
          pollState.timer = null
        }
        pollState.active = false
        pollState.finish = null
        broadcast(next)
        if (next === "done") {
          toast.success(message, { id: SYNC_TOAST_ID, duration: 4_000 })
          void queryClient.invalidateQueries()
          router.refresh()
        } else {
          toast.error(message, { id: SYNC_TOAST_ID, duration: 6_000 })
        }
        setTimeout(() => broadcast("idle"), 3_000)
      }

      pollState.finish = finish

      try {
        const res = await fetch("/api/sync/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full }),
        })
        if (!res.ok) {
          finish("error", "Falha ao iniciar a sincronização.")
          return
        }
      } catch {
        finish("error", "Não foi possível falar com a API.")
        return
      }

      let count = 0
      const poll = () => {
        if (count >= MAX_POLLS) {
          finish("error", "Sincronização demorou demais. Tente novamente.")
          return
        }
        pollState.timer = setTimeout(async () => {
          count++
          try {
            const res = await fetch("/api/sync/trigger")
            if (!res.ok) {
              poll()
              return
            }
            const data = (await res.json()) as TriggerResponseShape
            const serverStatus = data.results?.syncStatus ?? null
            if (serverStatus === "SUCCESS") {
              finish("done", "Sincronização concluída.")
            } else if (serverStatus === "ERROR") {
              finish("error", "A sincronização terminou com erro.")
            } else {
              poll()
            }
          } catch {
            poll()
          }
        }, POLL_INTERVAL_MS)
      }
      poll()
    },
    [queryClient, router],
  )

  return { status, trigger, isSyncing: status === "syncing" }
}
