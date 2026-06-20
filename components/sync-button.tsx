"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const POLL_INTERVAL_MS = 5_000
const POLL_LOOKBACK_MS = 10_000

type SyncStatus = "idle" | "syncing" | "done" | "error"
type ServerSyncStatus = "RUNNING" | "SUCCESS" | "ERROR"

type SyncRun = {
  status?: string | null
  createdAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  completedAt?: string | null
  endedAt?: string | null
  updatedAt?: string | null
}

type SyncStatusPayload = {
  results?: {
    providers?: {
      pluggy?: {
        lastRun?: SyncRun | null
      }
      binance?: {
        lastRun?: SyncRun | null
      }
    }
    recentRuns?: SyncRun[]
  }
}

type SettingsPayload = {
  syncIntervalHours?: number | string | null
  results?: {
    syncIntervalHours?: number | string | null
  }
}

function formatRelativeTime(date: Date | null, now: number): string {
  if (!date) return "nunca"
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "agora mesmo"
  if (diffMin < 60) return `há ${diffMin}min`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `há ${diffHrs}h`
  return `há ${Math.floor(diffHrs / 24)}d`
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function normalizeServerStatus(status: string | null | undefined) {
  return status?.toUpperCase() ?? null
}

function getRunTimestamp(run: SyncRun, fields: Array<keyof SyncRun>) {
  for (const field of fields) {
    const timestamp = parseTimestamp(run[field])
    if (timestamp !== null) return timestamp
  }
  return null
}

function getRuns(payload: SyncStatusPayload | null) {
  const providers = payload?.results?.providers
  return [
    ...(payload?.results?.recentRuns ?? []),
    providers?.pluggy?.lastRun ?? null,
    providers?.binance?.lastRun ?? null,
  ].filter((run): run is SyncRun => Boolean(run))
}

function getLastSuccessfulSyncAt(payload: SyncStatusPayload | null) {
  const latestTimestamp = getRuns(payload)
    .filter((run) => normalizeServerStatus(run.status) === "SUCCESS")
    .reduce<number | null>((latest, run) => {
      const timestamp = getRunTimestamp(run, [
        "finishedAt",
        "completedAt",
        "endedAt",
        "updatedAt",
        "startedAt",
        "createdAt",
      ])

      if (timestamp === null) return latest
      return latest === null ? timestamp : Math.max(latest, timestamp)
    }, null)

  return latestTimestamp === null ? null : new Date(latestTimestamp)
}

function getServerSyncStatus(
  payload: SyncStatusPayload | null,
  since?: number,
): ServerSyncStatus | null {
  const runs = getRuns(payload)
    .map((run) => ({
      run,
      timestamp: getRunTimestamp(run, [
        "startedAt",
        "createdAt",
        "updatedAt",
        "finishedAt",
        "completedAt",
        "endedAt",
      ]),
    }))
    .filter(({ timestamp }) => {
      if (!since) return true
      return timestamp !== null && timestamp >= since - POLL_LOOKBACK_MS
    })

  if (runs.some(({ run }) => normalizeServerStatus(run.status) === "RUNNING")) {
    return "RUNNING"
  }

  const latestRun = runs
    .filter(({ timestamp }) => timestamp !== null)
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0]?.run
  const latestStatus = normalizeServerStatus(latestRun?.status)

  if (latestStatus === "SUCCESS") return "SUCCESS"
  if (latestStatus === "ERROR" || latestStatus === "FAILED") return "ERROR"
  return null
}

function getSyncIntervalHours(payload: SettingsPayload | null) {
  const value =
    payload?.results?.syncIntervalHours ?? payload?.syncIntervalHours ?? null
  const numericValue = Number(value)

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url)
  if (!response.ok) return null
  return response.json() as Promise<T>
}

type SyncButtonProps = {
  showTime?: boolean
  className?: string
}

export function SyncButton({ showTime = false, className }: SyncButtonProps) {
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lastSyncAt, setLastSyncAtState] = useState<Date | null>(null)
  const [syncStateLoaded, setSyncStateLoaded] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [syncIntervalHours, setSyncIntervalHours] = useState(24)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCountRef = useRef(0)
  const startPollingRef = useRef<() => void>(() => {})
  const MAX_POLLS = 60 // 5 minutes at 5s intervals (full sync can take time)

  const refreshSyncState = useCallback(async () => {
    try {
      const [syncData, settingsData] = await Promise.all([
        fetchJson<SyncStatusPayload>("/api/sync/status").catch(() => null),
        fetchJson<SettingsPayload>("/api/settings").catch(() => null),
      ])
      const intervalHours = getSyncIntervalHours(settingsData)

      if (syncData !== null) {
        setLastSyncAtState(getLastSuccessfulSyncAt(syncData))
        setSyncStateLoaded(true)
      }

      if (intervalHours !== null) {
        setSyncIntervalHours(intervalHours)
      }

      if (getServerSyncStatus(syncData) === "RUNNING") {
        startPollingRef.current()
      }
    } catch {
      // Keep the last rendered state if a passive status refresh fails.
    }
  }, [])

  const startPolling = useCallback(
    (since?: number) => {
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
            const data = await fetchJson<SyncStatusPayload>("/api/sync/status")
            const serverStatus = getServerSyncStatus(data, since)

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
    },
    [status, refreshSyncState],
  )

  useEffect(() => {
    startPollingRef.current = startPolling
  }, [startPolling])

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshSyncState()
    }, 0)

    return () => clearTimeout(timer)
  }, [refreshSyncState])

  // Tick every minute so relativeTime and stale state re-derive without impure render reads.
  useEffect(() => {
    const tick = () => setCurrentTime(Date.now())
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [])

  const relativeTime = formatRelativeTime(lastSyncAt, currentTime)
  const isStale =
    status === "idle" &&
    syncStateLoaded &&
    (lastSyncAt === null ||
      currentTime - lastSyncAt.getTime() > syncIntervalHours * 60 * 60 * 1000)
  const syncText = isStale
    ? `sync atrasado: ${relativeTime}`
    : `sync: ${relativeTime}`
  const buttonTitle = isStale
    ? `Sincronização atrasada (${relativeTime}). Clique para sincronizar manualmente.`
    : "Sincronizar seus cascalhos com a API"

  const triggerSync = useCallback(async () => {
    if (status === "syncing") return
    const syncStartedAt = Date.now()
    setStatus("syncing")

    try {
      const res = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full: true }),
      })
      if (!res.ok) {
        setStatus("error")
        setTimeout(() => setStatus("idle"), 3_000)
        return
      }
      startPolling(syncStartedAt)
    } catch {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 3_000)
    }
  }, [status, startPolling])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        showTime && "flex-wrap justify-between",
        className,
      )}
      aria-live="polite"
    >
      {syncStateLoaded && (
        <span
          className={cn(
            "font-mono text-xs tracking-wider",
            showTime ? "block" : "hidden sm:block",
            isStale ? "text-amber-400" : "text-muted-foreground",
          )}
        >
          {syncText}
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
          isStale && "border-amber-500/50 bg-amber-500/10 text-amber-500",
        )}
        title={buttonTitle}
        aria-label={
          status === "syncing"
            ? "sync... (Sincronizando, aguarde)"
            : status === "done"
              ? "ok (Sincronização concluída com sucesso)"
              : status === "error"
                ? "err (Erro na sincronização, tentar novamente)"
                : isStale
                  ? `atualizar (Sincronização atrasada, última sincronização ${relativeTime})`
                  : `sync (Sincronizar dados${
                      lastSyncAt ? `, última sincronização ${relativeTime}` : ""
                    })`
        }
      >
        {isStale ? (
          <AlertTriangle className="size-3" />
        ) : (
          <RefreshCw
            className={cn("size-3", status === "syncing" && "animate-spin")}
          />
        )}
        {status === "syncing"
          ? "sync..."
          : status === "done"
            ? "ok"
            : status === "error"
              ? "err"
              : isStale
                ? "atualizar"
                : "sync"}
      </Button>
    </div>
  )
}
