"use client"

import { useState } from "react"
import { Link } from "next-view-transitions"
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  RotateCcw,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PageError } from "@/components/page-error"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"

type ReviewStatus = "open" | "resolved" | "ignored"
type Severity = "critical" | "high" | "medium" | "low"

type ReviewItem = {
  id: string
  kind: string
  severity: Severity
  title: string
  description: string
  impact: string
  origin: string
  amount?: number | null
  date?: string | null
  href?: string
  primaryAction: { label: string; href?: string; method?: "resolve" | "ignore" }
  secondaryAction?: { label: string; href?: string; method?: "resolve" | "ignore" }
  status: ReviewStatus
}

type InboxResponse = {
  summary: {
    total: number
    open: number
    resolved: number
    ignored: number
    high: number
  }
  results: ReviewItem[]
}

const severityLabel: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
}

const severityClass: Record<Severity, string> = {
  critical: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  high: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
}

function formatDate(value?: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function InboxPage() {
  const { format } = useCurrency()
  const { data, loading, error, refetch } = useApi<InboxResponse>("/api/inbox")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReviewStatus | "all">("open")

  async function updateStatus(item: ReviewItem, status: ReviewStatus) {
    setPendingId(item.id)
    try {
      const response = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      refetch()
    } finally {
      setPendingId(null)
    }
  }

  if (error) {
    return <PageError message={error} refetch={refetch} />
  }

  const items = data?.results ?? []
  const visibleItems = items.filter((item) =>
    filter === "all" ? true : item.status === filter,
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-20">
      <PageHeader
        eyebrow="Operação financeira"
        title="Inbox financeira"
        description="Pendências acionáveis que podem distorcer seus números, atrasar rotinas ou exigir decisão."
        actions={
          <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            Atualizar
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Abertas" value={data?.summary.open ?? 0} tone="primary" />
        <SummaryCard label="Alta prioridade" value={data?.summary.high ?? 0} tone="warning" />
        <SummaryCard label="Resolvidas" value={data?.summary.resolved ?? 0} tone="positive" />
        <SummaryCard label="Ignoradas" value={data?.summary.ignored ?? 0} tone="neutral" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          ["open", "Abertas"],
          ["resolved", "Resolvidas"],
          ["ignored", "Ignoradas"],
          ["all", "Todas"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as ReviewStatus | "all")}
            className={cn(
              "h-8 shrink-0 rounded-md border px-3 text-xs font-medium transition-colors",
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="surface flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Montando pendências...
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Inbox}
            title="Nada para revisar neste filtro"
            description="Quando surgirem transações ambíguas, faturas próximas ou conexões atrasadas, elas aparecerão aqui."
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleItems.map((item) => {
            const date = formatDate(item.date)
            const isPending = pendingId === item.id
            return (
              <article key={item.id} className="surface p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("border", severityClass[item.severity])}>
                        <AlertTriangle className="size-3" />
                        {severityLabel[item.severity]}
                      </Badge>
                      <Badge variant="outline">{item.origin}</Badge>
                      {item.status !== "open" ? (
                        <Badge variant="secondary">
                          {item.status === "resolved" ? "Resolvida" : "Ignorada"}
                        </Badge>
                      ) : null}
                      {date ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {date}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p className="rounded-md bg-muted/40 p-2">{item.impact}</p>
                      <p className="rounded-md bg-muted/40 p-2">
                        {item.amount != null ? `Valor relacionado: ${format(item.amount)}` : "Sem valor direto associado."}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:w-56 lg:flex-col">
                    {item.primaryAction.href ? (
                      <Button asChild size="sm">
                        <Link href={item.primaryAction.href}>
                          <ExternalLink className="size-3.5" />
                          {item.primaryAction.label}
                        </Link>
                      </Button>
                    ) : item.primaryAction.method ? (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(item, item.primaryAction.method === "ignore" ? "ignored" : "resolved")}
                        disabled={isPending}
                      >
                        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                        {item.primaryAction.label}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateStatus(item, "resolved")}
                      disabled={isPending || item.status === "resolved"}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Resolver
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(item, "ignored")}
                      disabled={isPending || item.status === "ignored"}
                    >
                      <Archive className="size-3.5" />
                      Ignorar
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "primary" | "warning" | "positive" | "neutral"
}) {
  const toneClass = {
    primary: "text-primary",
    warning: "text-amber-600 dark:text-amber-400",
    positive: "text-emerald-600 dark:text-emerald-400",
    neutral: "text-muted-foreground",
  }[tone]

  return (
    <div className="surface px-4 py-3">
      <p className="section-eyebrow">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  )
}
