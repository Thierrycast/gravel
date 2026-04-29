"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Link as LinkIcon,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WifiOff,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/format"

type PluggySuccessPayload = {
  item?: {
    id?: string
    status?: string
    connector?: {
      id?: number
      name?: string
    }
  }
}

type PluggyErrorPayload = {
  message?: string
  code?: string
}

type PluggyConnectHandle = {
  show: () => void
  hide: () => void
}

type StoredItem = {
  id: string
  pluggyItemId: string
  connectorName: string | null
  connectorId: number | null
  status: string | null
  updatedAt?: string | null
}

type LoadState = "loading" | "ready" | "error"

const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((mod) => mod.PluggyConnect),
  { ssr: false }
)

interface StatusMeta {
  label: string
  tone: "positive" | "info" | "warning" | "negative" | "neutral"
  description: string
  Icon: typeof CheckCircle2
  needsAction: boolean
}

function describeStatus(status: string | null): StatusMeta {
  switch (status) {
    case "UPDATED":
      return {
        label: "Atualizado",
        tone: "positive",
        description: "Os dados desta conexão estão sincronizados.",
        Icon: CheckCircle2,
        needsAction: false,
      }
    case "UPDATING":
      return {
        label: "Atualizando",
        tone: "info",
        description: "O Pluggy está buscando novas informações no banco.",
        Icon: Loader2,
        needsAction: false,
      }
    case "OUTDATED":
      return {
        label: "Desatualizado",
        tone: "warning",
        description: "Sincronização recomendada para receber novos dados.",
        Icon: RefreshCw,
        needsAction: true,
      }
    case "WAITING_USER_INPUT":
    case "WAITING_USER_ACTION":
      return {
        label: "Aguardando você",
        tone: "warning",
        description: "O banco solicitou uma ação sua para continuar.",
        Icon: AlertTriangle,
        needsAction: true,
      }
    case "LOGIN_ERROR":
      return {
        label: "Falha no acesso",
        tone: "negative",
        description: "As credenciais expiraram ou foram alteradas.",
        Icon: WifiOff,
        needsAction: true,
      }
    case "ERROR":
      return {
        label: "Erro",
        tone: "negative",
        description: "Ocorreu um erro ao consultar o banco.",
        Icon: AlertTriangle,
        needsAction: true,
      }
    default:
      return {
        label: status ?? "Sem status",
        tone: "neutral",
        description: "Sem informações recentes sobre esta conexão.",
        Icon: Plug,
        needsAction: false,
      }
  }
}

const TONE_BADGE_CLASS: Record<StatusMeta["tone"], string> = {
  positive:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  negative:
    "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  neutral: "border-border bg-muted text-muted-foreground",
}

function connectorInitials(name: string | null) {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function PluggyConnectClient() {
  const widgetRef = useRef<PluggyConnectHandle | null>(null)

  const [token, setToken] = useState<string | null>(null)
  const [tokenState, setTokenState] = useState<LoadState>("loading")
  const [tokenError, setTokenError] = useState<string | null>(null)

  const [items, setItems] = useState<StoredItem[]>([])
  const [itemsState, setItemsState] = useState<LoadState>("loading")
  const [itemsError, setItemsError] = useState<string | null>(null)

  const [isOpening, setIsOpening] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    tone: "positive" | "negative" | "info"
    message: string
  } | null>(null)
  const [reconnectItemId, setReconnectItemId] = useState<string | null>(null)

  const loadItems = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsRefreshing(true)
    }
    try {
      const response = await fetch("/api/pluggy/items", { cache: "no-store" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as StoredItem[]
      setItems(Array.isArray(data) ? data : [])
      setItemsState("ready")
      setItemsError(null)
    } catch (err) {
      setItemsState("error")
      setItemsError(err instanceof Error ? err.message : "Falha ao carregar itens")
    } finally {
      if (!options?.silent) {
        setIsRefreshing(false)
      }
    }
  }, [])

  const loadToken = useCallback(async () => {
    setTokenState("loading")
    setTokenError(null)
    try {
      const response = await fetch("/api/pluggy/connect-token", {
        method: "POST",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!data?.accessToken) throw new Error("Token inválido")
      setToken(data.accessToken)
      setTokenState("ready")
    } catch (err) {
      setTokenState("error")
      setTokenError(err instanceof Error ? err.message : "Falha ao iniciar widget")
    }
  }, [])

  useEffect(() => {
    void loadToken()
    void loadItems()
  }, [loadToken, loadItems])

  // Soft-poll while the page is open so newly created items pick up the
  // initial UPDATING → UPDATED transition without manual refresh.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadItems({ silent: true })
    }, 15000)
    return () => window.clearInterval(interval)
  }, [loadItems])

  const itemsByStatus = useMemo(() => {
    const counts = { updated: 0, attention: 0, syncing: 0, total: items.length }
    for (const item of items) {
      const meta = describeStatus(item.status)
      if (meta.tone === "positive") counts.updated += 1
      else if (meta.tone === "info") counts.syncing += 1
      else if (meta.needsAction) counts.attention += 1
    }
    return counts
  }, [items])

  function handleOpenWidget(targetItemId?: string) {
    if (tokenState !== "ready" || !widgetRef.current) {
      setFeedback({
        tone: "negative",
        message: "O widget ainda não está pronto. Aguarde alguns segundos.",
      })
      return
    }
    setIsOpening(true)
    setReconnectItemId(targetItemId ?? null)
    widgetRef.current.show()
  }

  async function handleSuccess(payload: PluggySuccessPayload) {
    const itemId = payload.item?.id
    if (!itemId) {
      setFeedback({
        tone: "negative",
        message: "A conexão concluiu mas não retornou identificador.",
      })
      setIsOpening(false)
      return
    }

    try {
      await fetch("/api/pluggy/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          connectorId: payload.item?.connector?.id,
          connectorName: payload.item?.connector?.name,
          status: payload.item?.status,
        }),
      })
      await loadItems({ silent: true })
      setFeedback({
        tone: "positive",
        message: reconnectItemId
          ? "Reconexão concluída com sucesso."
          : `Conta ${payload.item?.connector?.name ?? ""} conectada.`,
      })
    } catch (err) {
      setFeedback({
        tone: "negative",
        message: err instanceof Error ? err.message : "Falha ao salvar conexão",
      })
    } finally {
      setIsOpening(false)
      setReconnectItemId(null)
    }
  }

  function handleError(error: PluggyErrorPayload) {
    const suffix = error.code ? ` (${error.code})` : ""
    setFeedback({
      tone: "negative",
      message: `${error.message ?? "Falha ao conectar"}${suffix}`,
    })
    setIsOpening(false)
    setReconnectItemId(null)
  }

  async function handleDelete(item: StoredItem) {
    const ok = window.confirm(
      `Remover a conexão com ${item.connectorName ?? "este banco"}? Isso desconecta o item no Pluggy e remove o vínculo local.`
    )
    if (!ok) return

    setPendingItemId(item.pluggyItemId)
    try {
      const response = await fetch(`/api/pluggy/items/${item.pluggyItemId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err?.error ?? `HTTP ${response.status}`)
      }
      await loadItems({ silent: true })
      setFeedback({ tone: "positive", message: "Conexão removida." })
    } catch (err) {
      setFeedback({
        tone: "negative",
        message: err instanceof Error ? err.message : "Falha ao remover",
      })
    } finally {
      setPendingItemId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Conexões"
        title="Bancos & Sincronização"
        description="Conecte instituições financeiras pelo Pluggy para importar contas, faturas, transações e investimentos automaticamente."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadItems()}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn(
                  "size-3.5 text-muted-foreground",
                  isRefreshing && "animate-spin"
                )}
              />
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenWidget()}
              disabled={tokenState !== "ready" || isOpening}
            >
              {isOpening ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plug className="size-3.5" />
              )}
              {isOpening ? "Abrindo widget…" : "Conectar conta"}
            </Button>
          </>
        }
      />

      {/* Status banner */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label="Conexões ativas"
          value={String(itemsByStatus.total)}
          tone="neutral"
        />
        <SummaryStat
          label="Atualizadas"
          value={String(itemsByStatus.updated)}
          tone="positive"
          icon={CheckCircle2}
        />
        <SummaryStat
          label="Sincronizando"
          value={String(itemsByStatus.syncing)}
          tone="info"
          icon={Loader2}
        />
        <SummaryStat
          label="Precisam atenção"
          value={String(itemsByStatus.attention)}
          tone={itemsByStatus.attention > 0 ? "warning" : "neutral"}
          icon={AlertTriangle}
        />
      </div>

      {/* Token / feedback strip */}
      {tokenState === "error" ? (
        <InlineNotice
          tone="negative"
          icon={AlertTriangle}
          title="Não conseguimos iniciar o widget do Pluggy"
          message={tokenError ?? "Verifique as credenciais e tente novamente."}
          action={
            <Button variant="outline" size="sm" onClick={() => void loadToken()}>
              Tentar novamente
            </Button>
          }
        />
      ) : tokenState === "loading" ? (
        <InlineNotice
          tone="info"
          icon={Loader2}
          title="Preparando widget seguro"
          message="Estamos solicitando um token de uso único ao Pluggy."
        />
      ) : null}

      {feedback ? (
        <InlineNotice
          tone={feedback.tone}
          icon={
            feedback.tone === "positive"
              ? CheckCircle2
              : feedback.tone === "negative"
                ? AlertTriangle
                : Loader2
          }
          title={
            feedback.tone === "positive"
              ? "Tudo certo"
              : feedback.tone === "negative"
                ? "Algo deu errado"
                : "Em andamento"
          }
          message={feedback.message}
          dismiss={() => setFeedback(null)}
        />
      ) : null}

      {/* Connection list */}
      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight">Conexões salvas</h2>
            <p className="text-xs text-muted-foreground">
              Cada item representa uma instituição vinculada ao Pluggy.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Pluggy MTLS
          </div>
        </div>

        {itemsState === "loading" ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando conexões…
          </div>
        ) : itemsState === "error" ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertTriangle className="size-6 text-rose-500" />
            <div>
              <p className="text-sm font-medium">Não foi possível listar as conexões</p>
              <p className="text-xs text-muted-foreground">{itemsError}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadItems()}>
              Tentar novamente
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <LinkIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Nenhuma conta conectada</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Conecte um banco para importar saldos, transações, faturas e
                investimentos automaticamente. Suas credenciais nunca são
                armazenadas no Gravel — o Pluggy faz a ponte segura.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => handleOpenWidget()}
              disabled={tokenState !== "ready" || isOpening}
            >
              <Plug className="size-3.5" />
              Conectar primeiro banco
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const meta = describeStatus(item.status)
              const StatusIcon = meta.Icon
              const isPending = pendingItemId === item.pluggyItemId
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/70 text-xs font-semibold text-foreground/80 ring-1 ring-border">
                      {connectorInitials(item.connectorName)}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {item.connectorName ?? "Instituição"}
                        </p>
                        <Badge
                          className={cn(
                            "h-5 gap-1 border px-1.5 text-xs font-medium",
                            TONE_BADGE_CLASS[meta.tone]
                          )}
                        >
                          <StatusIcon
                            className={cn(
                              "size-3",
                              meta.tone === "info" && "animate-spin"
                            )}
                          />
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground/70">
                        {item.pluggyItemId}
                        {item.updatedAt ? ` · ${formatDateTime(item.updatedAt)}` : null}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {meta.needsAction ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenWidget(item.pluggyItemId)}
                        disabled={tokenState !== "ready" || isOpening}
                      >
                        <RefreshCw className="size-3.5" />
                        Reconectar
                      </Button>
                    ) : null}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleDelete(item)}
                      disabled={isPending}
                      aria-label="Remover conexão"
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Hidden widget mount */}
      <div className="hidden">
        {tokenState === "ready" && token ? (
          <PluggyConnect
            connectToken={token}
            includeSandbox={false}
            updateItem={reconnectItemId ?? undefined}
            innerRef={(instance) => {
              widgetRef.current = instance
            }}
            onSuccess={(payload) =>
              void handleSuccess(payload as PluggySuccessPayload)
            }
            onError={(error) => handleError(error as PluggyErrorPayload)}
            onClose={() => {
              setIsOpening(false)
              setReconnectItemId(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

interface SummaryStatProps {
  label: string
  value: string
  tone: "neutral" | "positive" | "info" | "warning"
  icon?: typeof CheckCircle2
}

function SummaryStat({ label, value, tone, icon: Icon }: SummaryStatProps) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500 dark:text-emerald-400",
    info: "text-sky-500 dark:text-sky-400",
    warning: "text-amber-500 dark:text-amber-400",
  }[tone]
  return (
    <div className="surface flex items-center gap-3 px-4 py-3">
      {Icon ? (
        <Icon
          className={cn(
            "size-4",
            toneClass,
            tone === "info" && "animate-spin"
          )}
        />
      ) : null}
      <div>
        <p className="section-eyebrow">{label}</p>
        <p className={cn("text-lg font-semibold tabular-nums", toneClass)}>
          {value}
        </p>
      </div>
    </div>
  )
}

interface InlineNoticeProps {
  tone: "positive" | "negative" | "info"
  icon: typeof CheckCircle2
  title: string
  message: string
  action?: React.ReactNode
  dismiss?: () => void
}

function InlineNotice({
  tone,
  icon: Icon,
  title,
  message,
  action,
  dismiss,
}: InlineNoticeProps) {
  const toneClass = {
    positive:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    negative:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  }[tone]

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        toneClass
      )}
    >
      <Icon className={cn("mt-0.5 size-4", tone === "info" && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs opacity-90">{message}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {dismiss ? (
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100"
        >
          Fechar
        </button>
      ) : null}
    </div>
  )
}
