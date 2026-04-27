"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SYNC_STORAGE_KEY = "gravel:lastSyncAt"
const POLL_INTERVAL_MS = 5_000 // poll status every 5s while syncing

type SyncStatus = "idle" | "syncing" | "done" | "error"

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
  const [clockTick, setClockTick] = useState(0)
  const [syncIntervalHours, setSyncIntervalHours] = useState(24)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCountRef = useRef(0)
  const autoSyncFiredRef = useRef(false)
  const MAX_POLLS = 60 // 5 minutes at 5s intervals (full sync can take time)

  // Fetch actual last sync time and settings from server on mount
  const refreshSyncState = useCallback(() => {
    Promise.all([
      fetch("/api/sync/trigger").then(r => r.json()),
      fetch("/api/settings").then(r => r.json())
    ])
      .then(([syncData, settingsData]) => {
        const serverDate = syncData.results?.lastSyncAt
          ? new Date(syncData.results.lastSyncAt)
          : null
        setLastSyncAtState(serverDate)
        
        if (settingsData.syncIntervalHours) {
          setSyncIntervalHours(settingsData.syncIntervalHours)
        }

        // If server says it's currently running, start polling
        if (syncData.results?.syncStatus === "RUNNING") {
          startPolling()
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshSyncState()
  }, [refreshSyncState])

  // Tick every minute so relativeTime re-derives without setState-in-effect
  useEffect(() => {
    const interval = setInterval(() => setClockTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  // clockTick intentionally triggers re-render; formatRelativeTime reads Date.now()
  void clockTick
  const relativeTime = formatRelativeTime(lastSyncAt)

  const startPolling = useCallback(() => {
    if (status === "syncing") return
    setStatus("syncing")
    pollCountRef.current = 0
    
    const finishPolling = (nextStatus: Exclude<SyncStatus, "syncing">) => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      setStatus(nextStatus)
      setTimeout(() => setStatus("idle"), 3_000)
      refreshSyncState() // Final refresh to get exact lastSyncAt
    }

    const poll = () => {
      if (pollCountRef.current >= MAX_POLLS) {
        finishPolling("error")
        return
      }
      pollTimerRef.current = setTimeout(async () => {
        pollCountRef.current++
        try {
          const res = await fetch("/api/sync/trigger")
          if (!res.ok) {
            poll() // retry
            return
          }
          const data = await res.json()
          const serverStatus = data.results?.syncStatus as string | null

          if (serverStatus === "SUCCESS") {
            finishPolling("done")
          } else if (serverStatus === "ERROR") {
            finishPolling("error")
          } else {
            poll()
          }
        } catch {
          poll()
        }
      }, POLL_INTERVAL_MS)
    }

    poll()
  }, [status, refreshSyncState])

  const triggerSync = useCallback(async () => {
    if (status === "syncing") return
    setStatus("syncing")

    try {
      const res = await fetch("/api/sync/trigger", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full: true }) 
      })
      if (!res.ok) {
        setStatus("error")
        setTimeout(() => setStatus("idle"), 3_000)
        return
      }
      startPolling()
    } catch {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 3_000)
    }
  }, [status, startPolling])

  // Auto-sync check (client-side fallback if tab stays open)
  useEffect(() => {
    if (autoSyncFiredRef.current || !lastSyncAt) return
    
    const intervalMs = syncIntervalHours * 60 * 60 * 1000
    const needsSync = Date.now() - lastSyncAt.getTime() > intervalMs
    
    if (needsSync) {
      autoSyncFiredRef.current = true
      // Small delay so the page has time to load first
      const t = setTimeout(() => triggerSync(), 5_000)
      return () => clearTimeout(t)
    }
  }, [lastSyncAt, syncIntervalHours, triggerSync])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      {lastSyncAt && (
        <span className="hidden sm:block font-mono text-xs text-muted-foreground tracking-wider">
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
