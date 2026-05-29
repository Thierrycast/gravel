"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type ProviderHealthResponse = {
  summary?: {
    provider?: string
    healthy?: boolean
  }
}

type Status = "loading" | "online" | "offline"

type Props = {
  endpoint: string
  label: string
  pollMs?: number
  className?: string
}

export function ProviderHealthBadge({
  endpoint,
  label,
  pollMs,
  className,
}: Props) {
  const [status, setStatus] = useState<Status>("loading")
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" })
        if (cancelled) return
        if (!res.ok) {
          setStatus("offline")
          setDetail(`HTTP ${res.status}`)
          return
        }
        const json = (await res.json()) as ProviderHealthResponse
        const healthy = json?.summary?.healthy === true
        setStatus(healthy ? "online" : "offline")
        setDetail(null)
      } catch (err) {
        if (cancelled) return
        setStatus("offline")
        setDetail(err instanceof Error ? err.message : "Sem conexão")
      }
    }

    check()
    if (!pollMs) return () => {
      cancelled = true
    }
    const interval = setInterval(check, pollMs)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [endpoint, pollMs])

  const dotColor =
    status === "online"
      ? "bg-emerald-500"
      : status === "offline"
        ? "bg-rose-500"
        : "bg-muted-foreground/60"

  const text =
    status === "loading"
      ? "verificando…"
      : status === "online"
        ? "online"
        : "indisponível"

  return (
    <span
      title={detail ? `${label}: ${detail}` : `${label}: ${text}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {status === "loading" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className={cn("inline-block size-2 rounded-full", dotColor)} />
      )}
      <span>
        {label} · {text}
      </span>
    </span>
  )
}
