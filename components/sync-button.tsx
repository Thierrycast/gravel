"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SYNC_STORAGE_KEY = "gravel:lastSyncAt"
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const POLL_INTERVAL_MS = 5_000 // poll status every 5s while syncing

type SyncStatus = "idle" | "syncing" | "done" | "error"

function getLastSyncAt(): Date | null {
  try {
    const stored = localStorage.getItem(SYNC_STORAGE_KEY)
    return stored ? new Date(stored) : null
  } catch {
    return null
  }
}

function setLastSyncAt(date: Date) {
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, date.toISOString())
  } catch {}
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "nunca"
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "agora mesmo"
  if (diffMin < 60) return `há ${diffMin}min`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `há ${diffHrs}h`
  return `há ${Math.floor(diffHrs / 24)}d`
}

export function SyncButton() {
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lastSyncAt, setLastSyncAtState] = useState<Date | null>(null)
  const [relativeTime, setRelativeTime] = useState("")
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCountRef = useRef(0)
  const autoSyncFiredRef = useRef(false)
  const MAX_POLLS = 24 // 2 minutes at 5s intervals

  // Fetch actual last sync time from server on mount
  useEffect(() => {
    fetch("/api/sync/trigger")
      .then((r) => r.json())
      .then((data) => {
        const serverDate = data.results?.lastSyncAt
          ? new Date(data.results.lastSyncAt)
          : null
        const localDate = getLastSyncAt()
        // Use whichever is more recent
        const best =
          serverDate && localDate
            ? serverDate > localDate
              ? serverDate
              : localDate
            : serverDate ?? localDate
        setLastSyncAtState(best)
      })
      .catch(() => {})
  }, [])

  // Update relative-time string every minute
  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastSyncAt))
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncAt))
    }, 60_000)
    return () => clearInterval(interval)
  }, [lastSyncAt])

  const triggerSync = useCallback(async () => {
    if (status === "syncing") return
    setStatus("syncing")

    try {
      await fetch("/api/sync/trigger", { method: "POST" })
    } catch {
      setStatus("error")
      return
    }

    // Poll until the server reports a completed run (max 2 min)
    pollCountRef.current = 0
    const poll = () => {
      if (pollCountRef.current >= MAX_POLLS) {
        setStatus("error")
        setTimeout(() => setStatus("idle"), 3_000)
        return
      }
      pollTimerRef.current = setTimeout(async () => {
        pollCountRef.current++
        try {
          const res = await fetch("/api/sync/trigger")
          if (!res.ok) {
            setStatus("error")
            setTimeout(() => setStatus("idle"), 3_000)
            return
          }
          const data = await res.json()
          const serverStatus = data.results?.syncStatus as string | null

          if (serverStatus === "SUCCESS" || serverStatus === "ERROR") {
            const syncedAt = new Date()
            setLastSyncAtState(syncedAt)
            setLastSyncAt(syncedAt)
            setStatus(serverStatus === "SUCCESS" ? "done" : "error")
            setTimeout(() => setStatus("idle"), 3_000)
          } else {
            poll()
          }
        } catch {
          poll()
        }
      }, POLL_INTERVAL_MS)
    }

    poll()
  }, [status])

  // Auto-sync once per day
  useEffect(() => {
    if (autoSyncFiredRef.current) return
    const last = getLastSyncAt()
    const needsSync = !last || Date.now() - last.getTime() > AUTO_SYNC_INTERVAL_MS
    if (needsSync) {
      autoSyncFiredRef.current = true
      // Small delay so the page has time to load first
      const t = setTimeout(() => triggerSync(), 3_000)
      return () => clearTimeout(t)
    }
  }, [triggerSync])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      {lastSyncAt && (
        <span className="hidden sm:block font-mono text-[10px] text-muted-foreground tracking-wider">
          sync: {relativeTime}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={triggerSync}
        disabled={status === "syncing"}
        className={cn(
          "font-mono text-xs gap-1.5 border-border",
          status === "done" && "border-emerald-500/50 text-emerald-400",
          status === "error" && "border-destructive/50 text-destructive",
        )}
        title="Sincronizar dados com a API"
      >
        <RefreshCw
          className={cn("size-3", status === "syncing" && "animate-spin")}
        />
        {status === "syncing"
          ? "sync..."
          : status === "done"
            ? "ok"
            : status === "error"
              ? "err"
              : "sync"}
      </Button>
    </div>
  )
}
