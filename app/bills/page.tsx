"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react"
import { useApi } from "@/hooks/use-api"
import {
  formatCurrency,
  formatDate,
  daysUntil,
  daysUntilLabel,
} from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { PageError } from "@/components/page-error"

interface Bill {
  id: string
  accountName: string
  dueDate: string
  totalAmount: number
  minimumPayment: number
  status: string
  closingDate: string
}

interface BillsSummary {
  totalOpen: number
  totalOverdue: number
  totalPaid: number
  counts: {
    total: number
    open: number
    overdue: number
    paid: number
  }
  upcoming: Bill[]
}

interface BillsResponse {
  results: Bill[]
}

interface BillsSummaryResponse {
  summary: BillsSummary
}

function getStatusConfig(status: string, dueDate: string) {
  const days = daysUntil(dueDate)

  if (status === "PAID") {
    return {
      label: "Paga",
      className: "bg-blue-400/10 text-blue-400 border-blue-400/20",
      icon: CheckCircle2,
      dotColor: "bg-blue-400",
    }
  }
  if (status === "OVERDUE" || days < 0) {
    return {
      label: "Vencida",
      className: "bg-red-400/10 text-red-400 border-red-400/20",
      icon: AlertCircle,
      dotColor: "bg-red-400",
    }
  }
  if (status === "CLOSED" || days <= 0) {
    return {
      label: "Fechada",
      className: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
      icon: CheckCircle2,
      dotColor: "bg-emerald-400",
    }
  }
  if (days <= 7) {
    return {
      label: "A vencer",
      className: "bg-amber-400/10 text-amber-400 border-amber-400/20",
      icon: Clock,
      dotColor: "bg-amber-400",
    }
  }
  return {
    label: "Aberta",
    className: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
    icon: Calendar,
    dotColor: "bg-zinc-400",
  }
}

function getInitials(name?: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

export default function BillsPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const monthParam = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`

  const { data: billsData, loading: billsLoading, error: billsError, refetch: refetchBills } =
    useApi<BillsResponse>("/api/domain/bills", { month: monthParam })

  const { data: summaryData, loading: summaryLoading, error: summaryError, refetch: refetchSummary } =
    useApi<BillsSummaryResponse>("/api/domain/metrics/bills/summary", {
      month: monthParam,
    })

  const loading = billsLoading || summaryLoading

  if (billsError || summaryError) {
    return (
      <PageError
        message="Erro ao carregar faturas"
        refetch={() => {
          refetchBills()
          refetchSummary()
        }}
      />
    )
  }

  const bills = billsData?.results
  const summary = summaryData?.summary

  const sortedBills = useMemo(() => {
    const list = bills ?? []
    return [...list].sort((a, b) => {
      const statusOrder: Record<string, number> = {
        OVERDUE: 0,
        OPEN: 1,
        CLOSED: 2,
        PAID: 3,
      }
      const aOrder = statusOrder[a.status] ?? 1
      const bOrder = statusOrder[b.status] ?? 1
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [bills])

  const totalAmount = summary
    ? summary.totalOpen + summary.totalOverdue + summary.totalPaid
    : 0

  function handlePrevMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11)
      setSelectedYear((y) => y - 1)
    } else {
      setSelectedMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (selectedMonth === 11) {
      setSelectedMonth(0)
      setSelectedYear((y) => y + 1)
    } else {
      setSelectedMonth((m) => m + 1)
    }
  }

  function handleGoToToday() {
    setSelectedMonth(now.getMonth())
    setSelectedYear(now.getFullYear())
  }

  const isCurrentMonth =
    selectedMonth === now.getMonth() && selectedYear === now.getFullYear()

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-10 max-w-5xl mx-auto w-full">
      {/* Period Navigation */}
      <div className="flex items-center justify-between">
        <h1 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Faturas
        </h1>
        <div className="flex items-center gap-1">
          {!isCurrentMonth && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={handleGoToToday}
            >
              Hoje
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handlePrevMonth}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-semibold capitalize">
            {monthNames[selectedMonth]} De {selectedYear}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleNextMonth}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Hero Card */}
      {loading ? (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-48" />
          <div className="flex gap-8">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ) : summary ? (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Total das Faturas
          </p>
          <p className="text-4xl font-bold tabular-nums tracking-tight text-pink-400">
            {formatCurrency(totalAmount)}
          </p>

          {/* Breakdown by status */}
          <div className="flex flex-wrap gap-6">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Abertas
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(summary.totalOpen)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-red-400">
                Vencidas
              </p>
              <p className="text-sm font-semibold tabular-nums text-red-400">
                {formatCurrency(summary.totalOverdue)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-400">
                Pagas
              </p>
              <p className="text-sm font-semibold tabular-nums text-emerald-400">
                {formatCurrency(summary.totalPaid)}
              </p>
            </div>
          </div>

          {/* Progress bar showing composition */}
          <div className="flex h-1.5 rounded-full bg-muted/50 overflow-hidden">
            {totalAmount > 0 && (
              <>
                <div
                  className="h-full bg-zinc-400 rounded-l-full"
                  style={{
                    width: `${(summary.totalOpen / totalAmount) * 100}%`,
                  }}
                />
                <div
                  className="h-full bg-red-400"
                  style={{
                    width: `${(summary.totalOverdue / totalAmount) * 100}%`,
                  }}
                />
                <div
                  className="h-full bg-emerald-400 rounded-r-full"
                  style={{
                    width: `${(summary.totalPaid / totalAmount) * 100}%`,
                  }}
                />
              </>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-zinc-400" />
              Abertas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-red-400" />
              Vencidas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-400" />
              Pagas
            </span>
          </div>
        </div>
      ) : null}

      {/* Status summary pills */}
      {!loading && summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Abertas
            </p>
            <p className="text-lg font-bold tabular-nums">
              {summary.counts.open}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(summary.totalOpen)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-red-400">
              Vencidas
            </p>
            <p className="text-lg font-bold tabular-nums text-red-400">
              {summary.counts.overdue}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(summary.totalOverdue)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-400">
              Pagas
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-400">
              {summary.counts.paid}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(summary.totalPaid)}
            </p>
          </div>
        </div>
      )}

      {/* Bills list */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Faturas do Periodo
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedBills.map((bill) => {
              const statusConfig = getStatusConfig(bill.status, bill.dueDate)
              const StatusIcon = statusConfig.icon
              const days = daysUntil(bill.dueDate)

              return (
                <div
                  key={bill.id}
                  className="rounded-xl border bg-card p-5 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {getInitials(bill.accountName)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {bill.accountName}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wider",
                            statusConfig.className
                          )}
                        >
                          <StatusIcon className="mr-1 size-2.5" />
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          Vence {formatDate(bill.dueDate)}
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            days < 0
                              ? "text-red-400"
                              : days <= 3
                                ? "text-amber-400"
                                : "text-muted-foreground"
                          )}
                        >
                          {bill.status === "PAID"
                            ? "Paga"
                            : daysUntilLabel(bill.dueDate)}
                        </span>
                      </div>
                    </div>

                    {/* Amount + link */}
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-base font-bold tabular-nums text-pink-400">
                        {formatCurrency(bill.totalAmount)}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          Min: {formatCurrency(bill.minimumPayment)}
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/transactions?accountName=${encodeURIComponent(bill.accountName)}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Empty State */}
      {!loading && (!bills || bills.length === 0) && (
        <div className="rounded-xl border border-dashed bg-card/50 py-20 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-muted p-5 mb-5">
            <CreditCard className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-1">
            Nenhuma fatura encontrada
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Nao identificamos registros de faturas para o periodo de{" "}
            {monthNames[selectedMonth]} de {selectedYear}.
          </p>
        </div>
      )}

      {/* Upcoming Bills */}
      {!loading && summary?.upcoming && summary.upcoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Proximos Vencimentos
          </p>
          <div className="rounded-xl border bg-card divide-y">
            {summary.upcoming.map((bill) => {
              const statusConfig = getStatusConfig(bill.status, bill.dueDate)
              return (
                <div
                  key={bill.id}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {getInitials(bill.accountName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {bill.accountName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(bill.dueDate)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">
                      {formatCurrency(bill.totalAmount)}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        statusConfig.className.split(" ")[1]
                      )}
                    >
                      {statusConfig.label}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      statusConfig.dotColor
                    )}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
