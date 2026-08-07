"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, PlugZap, X } from "lucide-react"

import { useApi } from "@/hooks/use-api"
import { useSyncStream } from "@/hooks/use-sync-stream"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ConnectionAlert = {
  kind: "needs-action" | "consent-expiring" | "connector-unstable" | "stale"
  severity: "warning" | "critical"
  itemId: string | null
  institution: string
  message: string
  daysLeft?: number
}

type Response = {
  summary?: { hasAlerts?: boolean }
  results?: { alerts?: ConnectionAlert[] }
}

const DISMISS_KEY = "gravel:connection-alerts-dismissed-at"
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000

/** Instante da dispensa, se ainda estiver dentro do TTL. */
function readDismissalAt(): number | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(DISMISS_KEY)
    if (!stored) return null
    const at = parseInt(stored, 10)
    if (!Number.isFinite(at)) return null
    return Date.now() - at < DISMISS_TTL_MS ? at : null
  } catch {
    return null
  }
}

/**
 * Avisa sobre conexões que precisam de ação humana: MFA/credencial expirada,
 * consentimento do Open Finance vencendo, instituição instável. Nada disso se
 * resolve com "sincronizar de novo" — por isso a ação é reconectar, e o banner é
 * separado do de falha de sync.
 */
export function ConnectionAlertsBanner() {
  // A revalidação vem de graça: `useSyncStream` invalida o React Query quando o
  // servidor sinaliza mudança de conexão, e este `useApi` é uma query como as
  // outras — sem polling próprio.
  const { data } = useApi<Response>("/api/pluggy/connections/health")
  // Inicializador lazy: a dispensa é lida uma vez, no mount. O TTL só importa
  // entre carregamentos da página — que é exatamente quando isto roda.
  const [dismissedAt, setDismissedAt] = useState(readDismissalAt)
  const { lastEvent } = useSyncStream()

  const alerts = data?.results?.alerts ?? []

  // Se um evento de conexão chegou **depois** da dispensa, o aviso volta: é
  // informação nova, não a repetição do que o usuário já ignorou.
  const connectionEventAt =
    lastEvent &&
    (lastEvent.type === "item:needs_action" || lastEvent.type === "connector:status")
      ? Date.parse(lastEvent.at)
      : null
  const dismissed =
    dismissedAt !== null &&
    !(connectionEventAt !== null && connectionEventAt > dismissedAt)

  if (dismissed || alerts.length === 0) return null

  const critical = alerts.some((alert) => alert.severity === "critical")
  const needsReconnect = alerts.some((alert) => alert.kind !== "connector-unstable")

  function dismiss() {
    const now = Date.now()
    setDismissedAt(now)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(now))
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        "mx-auto mb-4 flex w-full max-w-4xl items-start gap-3 rounded-md border px-3 py-2 text-sm text-foreground backdrop-blur-sm",
        critical
          ? "border-red-500/40 bg-red-500/10"
          : "border-amber-500/40 bg-amber-500/10",
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          critical ? "text-red-500" : "text-amber-500",
        )}
      />
      <div className="flex-1 space-y-1 leading-tight">
        {alerts.slice(0, 3).map((alert, index) => (
          <p key={`${alert.kind}-${alert.itemId ?? index}`}>
            <span className="font-medium">{alert.institution}</span>{" "}
            <span className="text-muted-foreground">{alert.message}</span>
          </p>
        ))}
        {alerts.length > 3 ? (
          <p className="text-xs text-muted-foreground">
            e mais {alerts.length - 3} conexão(ões) com aviso.
          </p>
        ) : null}
      </div>
      {needsReconnect ? (
        <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Link href="/connect">
            <PlugZap className="size-3.5" />
            Reconectar
          </Link>
        </Button>
      ) : null}
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
