"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { Repeat, CreditCard, ChevronLeft, ChevronRight } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import {
  type RecurringRule,
  type RecurringSummary,
  type RecurringData,
} from "@/lib/types/api"

const frequencyLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  YEARLY: "Anual",
  QUARTERLY: "Trimestral",
}

const chartConfig: ChartConfig = {
  fixed: {
    label: "Contas fixas",
    color: "#f59e0b",
  },
  installments: {
    label: "Parcelas",
    color: "#3b82f6",
  },
}

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function RecurringPage() {
  const { format } = useCurrency()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [year, setYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  const { data, loading } = useApi<RecurringData>("/api/recurring", {
    year: String(year),
  })

  const fixedExpenses = useMemo(
    () => data?.rules.filter((r) => r.type === "EXPENSE" && !r.isManual) ?? [],
    [data]
  )

  const installmentItems = useMemo(
    () => data?.rules.filter((r) => r.type === "EXPENSE" && r.isManual) ?? [],
    [data]
  )

  const fixedMonthly = fixedExpenses.reduce(
    (sum, r) => sum + Math.abs(Number(r.amount)),
    0
  )
  const installmentMonthly = installmentItems.reduce(
    (sum, r) => sum + Math.abs(Number(r.amount)),
    0
  )
  const totalMonthly = fixedMonthly + installmentMonthly

  const chartData = useMemo(() => {
    if (!data) return []
    return MONTHS.map((month) => ({
      month,
      fixed: fixedMonthly,
      installments: installmentMonthly,
    }))
  }, [data, fixedMonthly, installmentMonthly])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Recorr&ecirc;ncias</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/recurring/expenses"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Ver despesas
          </Link>
          <Link
            href="/recurring/income"
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            Ver receitas
          </Link>
        </div>
      </div>

      {/* Chart Card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Este ano / {year}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="size-2.5 rounded-full bg-amber-500" />
              <span className="text-xs text-muted-foreground">Parcelas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2.5 rounded-full bg-blue-500" />
              <span className="text-xs text-muted-foreground">Contas fixas</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          <div className="flex-1 min-w-0">
            <ChartContainer config={chartConfig} className="h-56 sm:h-64 w-full">
              <BarChart data={chartData} accessibilityLayer>
                <CartesianGrid vertical={false} strokeOpacity={0.1} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v) =>
                    v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                  }
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                  width={50}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span>
                          {chartConfig[name as keyof typeof chartConfig]?.label}:{" "}
                          {format(Number(value))}
                        </span>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="installments"
                  stackId="a"
                  fill="#f59e0b"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="fixed"
                  stackId="a"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Month summary tooltip */}
          <div className="w-48 rounded-lg border bg-popover p-4 shrink-0 hidden lg:block">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => {
                  if (selectedMonth === 0) {
                    setSelectedMonth(11)
                    setYear(year - 1)
                  } else {
                    setSelectedMonth(selectedMonth - 1)
                  }
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold">{MONTH_FULL[selectedMonth]}</span>
              <button
                onClick={() => {
                  if (selectedMonth === 11) {
                    setSelectedMonth(0)
                    setYear(year + 1)
                  } else {
                    setSelectedMonth(selectedMonth + 1)
                  }
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Parcelas</span>
                </div>
                <span className="font-semibold tabular-nums">{format(installmentMonthly)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Contas fixas</span>
                </div>
                <span className="font-semibold tabular-nums">{format(fixedMonthly)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold tabular-nums">{format(totalMonthly)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-6 border-b">
        <button className="pb-2 text-sm font-medium border-b-2 border-foreground">
          Recorr&ecirc;ncias
        </button>
        <Link href="/recurring/expenses" className="pb-2 text-sm text-muted-foreground hover:text-foreground">
          Gasto por conta
        </Link>
        <Link href="/categories" className="pb-2 text-sm text-muted-foreground hover:text-foreground">
          Gastos por categoria
        </Link>
      </div>

      {/* Two columns: Fixed & Installments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fixed expenses */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Repeat className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">Parcelas</h3>
            <span className="text-xs text-muted-foreground">{installmentItems.length}</span>
          </div>
          <div className="space-y-2">
            {installmentItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Nenhuma parcela encontrada.
              </p>
            )}
            {installmentItems.map((rule) => {
              const total = rule.occurrences > 0 ? rule.occurrences : 12
              const remaining = rule.nextDate && rule.lastDate
                ? Math.max(
                    1,
                    Math.ceil(
                      (new Date(rule.lastDate).getTime() -
                        new Date(rule.nextDate).getTime()) /
                        (1000 * 60 * 60 * 24 * 30)
                    )
                  )
                : total
              const current = Math.max(0, total - remaining)
              const progressValue = (current / total) * 100

              return (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {rule.description}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {rule.category}
                      </Badge>
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="h-1.5 flex-1 max-w-24 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${progressValue}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {current}/{total}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-pink-400 ml-3">
                    {format(Math.abs(rule.amount))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Contas fixas */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">Contas Fixas</h3>
            <span className="text-xs text-muted-foreground">{fixedExpenses.length}</span>
          </div>
          <div className="space-y-2">
            {fixedExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Nenhuma conta fixa encontrada.
              </p>
            )}
            {fixedExpenses.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {rule.description}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {rule.category}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {frequencyLabel[rule.frequency] ?? rule.frequency}
                    </Badge>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-pink-400 ml-3">
                  {format(Math.abs(rule.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
