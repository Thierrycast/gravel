"use client"

import { useEffect, useState } from "react"
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface SyncState {
  stateKey: string
  status: "RUNNING" | "SUCCESS" | "ERROR"
  lastProjectedAt: string | null
  updatedAt: string
}

export function SyncStatus() {
  const [states, setStates] = useState<SyncState[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/sync/status")
      if (res.ok) {
        const data = await res.json()
        setStates(data)
      }
    } catch (err) {
      console.error("Failed to fetch sync status:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [])

  if (loading && states.length === 0) return null

  const isAnyRunning = states.some(s => s.status === "RUNNING")
  const isAnyError = states.some(s => s.status === "ERROR")

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border transition-all",
      isAnyRunning ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
      isAnyError ? "bg-rose-500/10 border-rose-500/20 text-rose-500" :
      "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
    )}>
      {isAnyRunning ? (
        <>
          <RefreshCw className="size-3 animate-spin" />
          <span>Sincronizando...</span>
        </>
      ) : isAnyError ? (
        <>
          <AlertCircle className="size-3" />
          <span>Erro no Sync</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-3" />
          <span>Dados Atualizados</span>
        </>
      )}
    </div>
  )
}
