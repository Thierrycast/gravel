"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Failure = {
  provider?: string
  resource?: string
  startedAt?: string
  errorMessage?: string | null
}

type FailureResponse = {
  summary?: {
    hasFailure?: boolean
  }
  results?: {
    failure?: Failure | null
  }
}

function formatRelative(iso?: string): string {
  if (!iso) return "recentemente"
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "recentemente"
  const diffMin = Math.max(1, Math.floor((Date.now() - then) / 60_000))
  if (diffMin < 60) return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  return `há ${Math.floor(diffH / 24)}d`
}

const DISMISS_KEY = "gravel:sync-failure-dismissed-at"
const DISMISS_TTL_MS = 60 * 60 * 1000

export function SyncFailureBanner() {
  const [failure, setFailure] = useState<Failure | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/last-failure", { cache: "no-store" })
      if (!res.ok) return
      const json = (await res.json()) as FailureResponse
      if (json?.summary?.hasFailure) {
        setFailure(json.results?.failure ?? null)
      } else {
        setFailure(null)
      }
    } catch {
      // Silent — banner stays hidden when health endpoint is unreachable.
    }
  }, [])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DISMISS_KEY)
      if (stored && Date.now() - parseInt(stored, 10) < DISMISS_TTL_MS) {
        setDismissed(true)
      }
    } catch {
      // ignore
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  if (!failure || dismissed) return null

  async function retry() {
    setRetrying(true)
    try {
      const res = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Sync disparado. Toa procurando o cascalho perdido…")
      setTimeout(() => fetchStatus(), 30_000)
    } catch (err) {
      toast.error(
        err instanceof Error ? `Falha ao disparar sync: ${err.message}` : "Falha ao disparar sync"
      )
    } finally {
      setRetrying(false)
    }
  }

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
  }

  const provider = failure.provider?.toLowerCase() ?? "sync"
  const when = formatRelative(failure.startedAt)

  return (
    <div
      role="alert"
      className={cn(
        "mx-auto mb-4 flex w-full max-w-4xl items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground",
        "backdrop-blur-sm"
      )}
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
      <div className="flex-1 leading-tight">
        <span className="font-medium">Último sync falhou</span>{" "}
        <span className="text-muted-foreground">
          ({provider}, {when}).
        </span>
        {failure.errorMessage ? (
          <span
            className="ml-1 hidden text-xs text-muted-foreground/80 md:inline"
            title={failure.errorMessage}
          >
            {failure.errorMessage.slice(0, 120)}
            {failure.errorMessage.length > 120 ? "…" : ""}
          </span>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={retry}
        disabled={retrying}
        className="h-7 gap-1.5 text-xs"
      >
        <RefreshCw className={cn("size-3.5", retrying && "animate-spin")} />
        Tentar agora
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
