"use client"

import { useState } from "react"
import { Link } from "next-view-transitions"
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  RotateCcw,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PageError } from "@/components/page-error"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"

type CloseStep = {
  id: string
  title: string
  description: string
  href: string
  pending: number
  impact: string
  completed: boolean
  completedAt?: string | null
}

type MonthlyCloseResponse = {
  summary: {
    monthKey: string
    income: number
    outflow: number
    net: number
    savingsRate: number | null
    topCategory: { name: string; amount: number } | null
    openInboxItems: number
    completedSteps: number
    totalSteps: number
    completedAt?: string | null
  }
  results: CloseStep[]
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
}

export default function MonthlyClosePage() {
  const { format } = useCurrency()
  const [month, setMonth] = useState(currentMonthKey())
  const { data, loading, error, refetch } = useApi<MonthlyCloseResponse>(
    "/api/monthly-close",
    { month },
  )
  const [pendingStep, setPendingStep] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)

  async function toggleStep(step: CloseStep) {
    setPendingStep(step.id)
    try {
      const response = await fetch("/api/monthly-close", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          stepId: step.id,
          completed: !step.completed,
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      refetch()
    } finally {
      setPendingStep(null)
    }
  }

  async function finishClose() {
    setFinishing(true)
    try {
      const response = await fetch("/api/monthly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      refetch()
    } finally {
      setFinishing(false)
    }
  }

  if (error) {
    return <PageError message={error} refetch={refetch} />
  }

  const steps = data?.results ?? []
  const summary = data?.summary
  const completed = summary?.completedSteps ?? 0
  const total = summary?.totalSteps ?? 0
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const canFinish = total > 0 && completed === total

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-20">
      <PageHeader
        eyebrow="Rotina operacional"
        title="Fechamento do mês"
        description="Checklist guiado para revisar receitas, faturas, categorias, recorrências e metas antes de encerrar o mês financeiro."
        actions={
          <>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonthKey())}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            />
            <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Atualizar
            </Button>
          </>
        }
      />

      <div className="surface p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="section-eyebrow">{monthLabel(month)}</p>
            <h2 className="text-xl font-semibold tracking-tight">
              {progress}% concluído
            </h2>
            <p className="text-sm text-muted-foreground">
              {completed} de {total} etapas revisadas.
              {summary?.completedAt ? ` Fechado em ${new Date(summary.completedAt).toLocaleString("pt-BR")}.` : ""}
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:w-[520px]">
            <Metric label="Receitas" value={summary ? format(summary.income) : "..."} />
            <Metric label="Gastos reais" value={summary ? format(summary.outflow) : "..."} />
            <Metric label="Resultado" value={summary ? format(summary.net) : "..."} />
            <Metric
              label="Taxa de poupança"
              value={
                summary?.savingsRate == null
                  ? "Sem receita"
                  : `${summary.savingsRate.toFixed(1)}%`
              }
            />
          </div>
        </div>
        <Progress value={progress} className="mt-4" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {loading ? (
            <div className="surface flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Montando checklist...
            </div>
          ) : (
            steps.map((step, index) => {
              const isPending = pendingStep === step.id
              return (
                <article key={step.id} className="surface p-4">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => toggleStep(step)}
                      className={cn(
                        "mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                        step.completed
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                      aria-label={step.completed ? "Reabrir etapa" : "Concluir etapa"}
                    >
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : step.completed ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Circle className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="section-eyebrow">Etapa {index + 1}</span>
                        {step.pending > 0 ? (
                          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                            {step.pending} pendência{step.pending === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                            Sem pendências abertas
                          </span>
                        )}
                      </div>
                      <h2 className="mt-1 text-base font-semibold tracking-tight">{step.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      <p className="mt-3 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                        {step.impact}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="hidden shrink-0 sm:inline-flex">
                      <Link href={step.href}>
                        Abrir
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </article>
              )
            })
          )}
        </div>

        <aside className="surface h-fit p-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Resumo do mês</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <SummaryRow label="Inbox aberta" value={String(summary?.openInboxItems ?? 0)} />
            <SummaryRow
              label="Maior categoria"
              value={
                summary?.topCategory
                  ? `${summary.topCategory.name} · ${format(summary.topCategory.amount)}`
                  : "Sem dados"
              }
            />
            <SummaryRow label="Resultado final" value={summary ? format(summary.net) : "..."} />
          </div>
          <Button
            className="mt-5 w-full"
            onClick={finishClose}
            disabled={!canFinish || finishing || loading}
          >
            {finishing ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Concluir fechamento
          </Button>
          {!canFinish ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Conclua todas as etapas antes de gerar o resumo persistente.
            </p>
          ) : (
            <Link href="/inbox" className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Revisar inbox
              <ArrowRight className="size-3" />
            </Link>
          )}
        </aside>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <p className="section-eyebrow">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[160px] text-right font-medium">{value}</span>
    </div>
  )
}
